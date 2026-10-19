import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.ts'))
      return {
        format: 'module',
        shortCircuit: true,
        source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText,
      };
    return next(url, context);
  },
});
const { deriveBidDistribution } = await import('../src/features/jubjub/bid-distribution.ts');
const scale = 1000000n;
const row = (
  sequence,
  positions,
  committedUnits,
  at = 100 + sequence,
  highestBidUnits = committedUnits,
) => ({
  sequence,
  positions,
  committedUnits: String(committedUnits),
  at,
  averageBidUnits: '100000000',
  highestBidUnits: String(BigInt(highestBidUnits) < 100n * scale ? 100n * scale : highestBidUnits),
  qualifyingBidUnits: '100000000',
});
const history = (rows, overrides = {}) => ({
  campaignId: 'test-campaign',
  rulesHash: `0x${'12'.repeat(32)}`,
  rows,
  cursor: (rows.at(-1)?.sequence ?? -1) + 1,
  more: false,
  ...overrides,
});
function entrants(amounts) {
  let total = 0n;
  let highest = 100n * scale;
  return history([
    row(0, 0, 0n),
    ...amounts.map((amount, index) => {
      total += BigInt(amount) * scale;
      if (BigInt(amount) * scale > highest) highest = BigInt(amount) * scale;
      return row(index + 1, index + 1, total, 101 + index, highest);
    }),
  ]);
}
function summaryFor(h, overrides = {}) {
  const last = h.rows.at(-1);
  return {
    campaignId: h.campaignId,
    rulesHash: h.rulesHash,
    phase: 'bidding',
    serverTime: last.at,
    positions: last.positions,
    committedUnits: last.committedUnits,
    bidTransactions: last.sequence,
    refundOpen: false,
    snapshotHash: null,
    mergedRoot: null,
    bidPaused: false,
    averageBidUnits: last.averageBidUnits,
    highestBidUnits: last.highestBidUnits,
    qualifyingBidUnits: last.qualifyingBidUnits,
    stage: 'auction',
    auctionSeats: 1623,
    ...overrides,
  };
}

test('all seven exact interval boundaries count participants once, including 100000 in the sixth band', () => {
  const h = entrants([
    100, 450, 500, 950, 1000, 4950, 5000, 9950, 10000, 49950, 50000, 100000, 100050,
  ]);
  const result = deriveBidDistribution({ history: h, summary: summaryFor(h) });
  assert.deepEqual(
    result.bands.map((band) => band.count),
    [2, 2, 2, 2, 2, 2, 1],
  );
  assert.deepEqual(
    result.bands.map((band) => band.entryUnits),
    [550n, 1450n, 5950n, 14950n, 59950n, 150000n, 100050n].map((amount) => String(amount * scale)),
  );
  assert.equal(result.bands[5].includeMax, true);
  assert.equal(result.bands[6].excludeMin, true);
  assert.equal(result.classifiedParticipants, 13);
  assert.equal(result.unclassifiedParticipants, 0);
  assert.equal(result.coveragePercent, 100);
  assert.equal(result.status, 'ready');
  assert.equal(result.asOf, h.rows.at(-1).at);
  assert.ok(Math.abs(result.bands.reduce((sum, band) => sum + band.share, 0) - 100) < 1e-10);
});

test('a first payment of 400 followed by 100 more remains one initial participant below 500', () => {
  const h = history([row(0, 0, 0), row(1, 1, 400n * scale), row(2, 1, 500n * scale)]);
  const result = deriveBidDistribution({ history: h });
  assert.equal(result.bands[0].count, 1);
  assert.equal(result.bands[0].entryUnits, String(400n * scale));
  assert.equal(result.bands[1].count, 0);
  assert.equal(result.classifiedParticipants, 1);
  assert.equal(result.historyParticipants, 1);
  assert.equal(result.topUpUpdates, 1);
});

test('multiple added positions remain unknown rather than splitting their combined payment', () => {
  const h = history([
    row(0, 0, 0),
    row(1, 2, 1000n * scale, 101, 500n * scale),
    row(2, 3, 1200n * scale, 102, 500n * scale),
  ]);
  const result = deriveBidDistribution({ history: h });
  assert.equal(result.bands[0].count, 1);
  assert.equal(result.bands[1].count, 0);
  assert.equal(result.unclassifiedParticipants, 2);
  assert.equal(result.classifiedParticipants, 1);
  assert.equal(result.historyParticipants, 3);
  assert.ok(Math.abs(result.bands[0].share - 100 / 3) < 1e-10);
  assert.ok(Math.abs(result.unclassifiedShare - 200 / 3) < 1e-10);
  assert.ok(Math.abs(result.coveragePercent - 100 / 3) < 1e-10);
  assert.equal(result.status, 'partial');
});

test('amounts below reserve, zero and values outside the 50 P20 step stay unknown', () => {
  let total = 0n;
  const amounts = [0n, 50n * scale, 100n * scale - 1n, 100n * scale + 1n, 100000n * scale + 1n];
  const rows = [
    row(0, 0, 0),
    ...amounts.map((amount, index) => {
      total += amount;
      return row(index + 1, index + 1, total);
    }),
  ];
  const result = deriveBidDistribution({ history: history(rows) });
  assert.equal(result.classifiedParticipants, 0);
  assert.equal(result.unclassifiedParticipants, 5);
  assert.equal(result.historyParticipants, 5);
  assert.equal(result.unclassifiedShare, 100);
  assert.equal(
    result.bands.reduce((sum, band) => sum + band.count, 0),
    0,
  );
});

test('large exact base-unit changes keep both band placement and entry sums without floating-point loss', () => {
  const large = 10000000000000000000000000000000n;
  const result = deriveBidDistribution({
    history: history([
      row(0, 0, 0n),
      row(1, 1, large),
      row(2, 2, large + 100n * scale),
      row(3, 2, large + 150n * scale),
    ]),
  });
  assert.equal(result.bands[6].count, 1);
  assert.equal(result.bands[6].entryUnits, String(large));
  assert.equal(result.bands[0].count, 1);
  assert.equal(result.bands[0].entryUnits, '100000000');
  assert.equal(result.topUpUpdates, 1);
  assert.equal(result.coveragePercent, 100);
});

test('missing initial baseline and sequence gaps preserve an explicit unknown population', () => {
  const h = history([
    row(4, 4, 400n * scale),
    row(5, 5, 500n * scale),
    row(8, 7, 1500n * scale),
    row(9, 8, 2000n * scale),
  ]);
  const result = deriveBidDistribution({ history: h });
  assert.equal(result.historyParticipants, 8);
  assert.equal(result.classifiedParticipants, 2);
  assert.equal(result.unclassifiedParticipants, 6);
  assert.deepEqual(
    result.bands.map((band) => band.count),
    [1, 1, 0, 0, 0, 0, 0],
  );
  assert.equal(result.coveragePercent, 25);
  assert.equal(result.unclassifiedShare, 75);
  assert.equal(result.status, 'partial');
  assert.match(result.reason, /baseline.*sequence gaps/);
});

test('negative committed or position corrections suppress distributions that cannot identify removed entrants', () => {
  for (const correction of [row(3, 1, 800n * scale), row(3, 2, 900n * scale)]) {
    const h = history([
      row(0, 0, 0),
      row(1, 1, 500n * scale),
      row(2, 2, 1000n * scale),
      correction,
    ]);
    const result = deriveBidDistribution({ history: h });
    assert.equal(result.status, 'adjusted');
    assert.deepEqual(result.bands, []);
    assert.equal(result.coveragePercent, 0);
    assert.match(result.reason, /totals were reduced/);
  }
});

test('identical duplicates are deduplicated while conflicting sequences, invalid data and time reversal fail closed', () => {
  const baseline = row(0, 0, 0),
    next = row(1, 1, 500n * scale);
  const okay = deriveBidDistribution({ history: history([next, baseline, { ...next }]) });
  assert.equal(okay.classifiedParticipants, 1);
  for (const rows of [
    [baseline, next, { ...next, committedUnits: '600000000' }],
    [baseline, { ...next, committedUnits: 'invalid' }],
    [baseline, { ...next, highestBidUnits: 'invalid' }],
    [baseline, { ...next, positions: 1.5 }],
    [baseline, { ...next, at: 99 }],
  ]) {
    const invalid = deriveBidDistribution({ history: history(rows) });
    assert.equal(invalid.status, 'invalid');
    assert.deepEqual(invalid.bands, []);
  }
});

test('campaign/rules mismatches cannot combine identities and absent history stays unavailable', () => {
  const h = entrants([100]);
  for (const override of [{ campaignId: 'other' }, { rulesHash: `0x${'34'.repeat(32)}` }]) {
    const result = deriveBidDistribution({ history: h, summary: summaryFor(h, override) });
    assert.equal(result.status, 'mismatch');
    assert.deepEqual(result.bands, []);
  }
  for (const h of [undefined, history([])]) {
    const result = deriveBidDistribution({ history: h });
    assert.equal(result.status, 'missing');
    assert.equal(result.historyParticipants, null);
  }
  const zero = deriveBidDistribution({ history: entrants([]) });
  assert.equal(zero.status, 'ready');
  assert.equal(zero.historyParticipants, 0);
  assert.ok(zero.bands.every((band) => band.count === 0 && band.share === 0));
  assert.equal(zero.coveragePercent, 0);
});

test('incomplete pagination and newer summary retain history denominator and do not invent additional people', () => {
  const h = entrants([100, 500]);
  const partial = deriveBidDistribution({ history: { ...h, more: true } });
  assert.equal(partial.status, 'partial');
  assert.equal(partial.classifiedParticipants, 2);
  assert.equal(partial.historyParticipants, 2);
  assert.match(partial.reason, /part of the published history/);
  const ahead = deriveBidDistribution({
    history: h,
    summary: summaryFor(h, { positions: 3, committedUnits: '1200000000', serverTime: 110 }),
  });
  assert.equal(ahead.status, 'partial');
  assert.equal(ahead.summaryAhead, true);
  assert.equal(ahead.asOf, 102);
  assert.equal(ahead.historyParticipants, 2);
  assert.equal(ahead.classifiedParticipants, 2);
  assert.equal(ahead.unclassifiedParticipants, 0);
  assert.deepEqual(
    ahead.bands.slice(0, 2).map((band) => band.share),
    [50, 50],
  );
  const older = deriveBidDistribution({
    history: h,
    summary: summaryFor(h, { positions: 1, committedUnits: '100000000', serverTime: 101 }),
  });
  assert.equal(older.status, 'ready');
  assert.equal(older.summaryAhead, false);
  assert.equal(older.historyParticipants, 2);
});

test('identical complete public histories can describe different current-bid distributions', () => {
  // After [100,400,500,1000], a top-up of 100 could change either 400 or 500.
  // Both possibilities keep sum, count, mean, highest and lowest/qualifying bid
  // identical. Additional 100-P20 positions extend this to a full 1623-seat book.
  const a = [100n, 500n, 500n, 1000n];
  const b = [100n, 400n, 600n, 1000n];
  const aggregate = (values) => ({
    sum: values.reduce((total, value) => total + value, 0n),
    positions: values.length,
    highest: values.reduce((max, value) => (value > max ? value : max)),
    lowest: values.reduce((min, value) => (value < min ? value : min)),
  });
  assert.deepEqual(aggregate(a), aggregate(b));
  assert.notEqual(
    a.filter((value) => value < 500n).length,
    b.filter((value) => value < 500n).length,
  );
  const h = entrants([100, 400, 500, 1000]);
  h.rows.push(row(5, 4, 2100n * scale, 105, 1000n * scale));
  const inferred = deriveBidDistribution({ history: h });
  assert.deepEqual(
    inferred.bands.slice(0, 3).map((band) => band.count),
    [2, 1, 1],
  );
  assert.equal(inferred.classifiedParticipants, 4);
  assert.equal(inferred.topUpUpdates, 1);
  assert.equal(inferred.bands[0].entryUnits, String(500n * scale));
});

test('an aggregate increase above the highest bid stays unknown and a gap is not counted as one top-up', () => {
  const h = history([
    row(0, 0, 0),
    row(1, 1, 100n * scale),
    // One new 400-P20 entrant plus a 100-P20 top-up could produce this snapshot.
    row(2, 2, 600n * scale, 102, 400n * scale),
    row(5, 2, 700n * scale, 105, 400n * scale),
    row(6, 2, 750n * scale, 106, 400n * scale),
  ]);
  const result = deriveBidDistribution({ history: h });
  assert.equal(result.status, 'partial');
  assert.equal(result.classifiedParticipants, 1);
  assert.equal(result.unclassifiedParticipants, 1);
  assert.equal(result.bands[0].count, 1);
  assert.equal(result.bands[1].count, 0);
  assert.equal(result.topUpUpdates, 1);
});
