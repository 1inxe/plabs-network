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
        source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText,
        shortCircuit: true,
      };
    return next(url, context);
  },
});
const { deriveAuctionAnalytics } = await import('../src/features/jubjub/auction-analytics.ts');
const campaignId = 'jubjub-analytics-test';
const rulesHash = `0x${'12'.repeat(32)}`;
const row = (sequence, at, positions, committedUnits) => ({
  sequence,
  at,
  positions,
  committedUnits: String(committedUnits),
  averageBidUnits: '100000000',
  highestBidUnits: '200000000',
  qualifyingBidUnits: '100000000',
});
function fixture(rows, overrides = {}) {
  const latest = rows.at(-1) ?? row(0, 100, 0, '0');
  return {
    now: 1000,
    windowSeconds: null,
    startsAt: 100,
    seats: 10,
    summary: {
      campaignId,
      rulesHash,
      phase: 'bidding',
      serverTime: 1000,
      refundOpen: false,
      committedUnits: latest.committedUnits,
      positions: latest.positions,
      bidTransactions: 7,
      snapshotHash: null,
      mergedRoot: null,
      bidPaused: false,
      averageBidUnits: '100000000',
      highestBidUnits: '200000000',
      qualifyingBidUnits: '100000000',
      stage: 'auction',
      auctionSeats: 10,
    },
    history: { campaignId, rulesHash, rows, cursor: latest.sequence + 1, more: false },
    ...overrides,
  };
}

test('funded positions, transactions, and history updates remain separate counts', () => {
  const result = deriveAuctionAnalytics(
    fixture([
      row(0, 100, 0, 0),
      row(1, 200, 1, 100000000),
      row(2, 300, 1, 150000000),
      row(3, 400, 2, 250000000),
    ]),
  );
  assert.equal(result.participants, 2);
  assert.equal(result.bidTransactions, 7);
  assert.equal(result.window.updates, 3);
  assert.equal(result.window.newParticipants, 2);
  assert.equal(result.window.committedDeltaUnits, '250000000');
  assert.equal(result.perParticipantMeanUnits, '125000000');
  assert.equal(result.occupancyPercent, 20);
  assert.equal(result.unfilledSeats, 8);
  assert.equal(result.overCapacity, 0);
  assert.deepEqual(
    result.activity.map((activity) => activity.kind),
    ['new-bidders', 'increase', 'new-bidders'],
  );
  assert.equal(result.historyStatus, 'ready');
  assert.equal(result.window.complete, true);
});

test('cutoff is an exclusive update boundary, now is inclusive, and future records stay out', () => {
  const result = deriveAuctionAnalytics(
    fixture(
      [
        row(0, 100, 0, 0),
        row(1, 699, 1, 100000000),
        row(2, 700, 2, 200000000),
        row(3, 701, 3, 300000000),
        row(4, 1000, 4, 400000000),
        row(5, 1001, 5, 500000000),
      ],
      { windowSeconds: 300, summary: undefined },
    ),
  );
  assert.equal(result.window.from, 700);
  assert.equal(result.window.baselineAt, 700);
  assert.equal(result.window.updates, 2);
  assert.equal(result.window.newParticipants, 2);
  assert.equal(result.window.committedDeltaUnits, '200000000');
  assert.deepEqual(result.participationTrend, [
    { at: 700, sequence: null, positions: 2 },
    { at: 701, sequence: 3, positions: 3 },
    { at: 1000, sequence: 4, positions: 4 },
  ]);
  assert.deepEqual(
    result.activity.map((activity) => activity.sequence),
    [4, 3],
  );
});

test('the campaign baseline and empty intervals create no phantom updates or participants', () => {
  const initial = deriveAuctionAnalytics(fixture([row(0, 100, 0, 0)], { windowSeconds: 1200 }));
  assert.equal(initial.window.from, 100);
  assert.equal(initial.window.updates, 0);
  assert.equal(initial.window.newParticipants, 0);
  assert.equal(initial.window.committedDeltaUnits, '0');
  assert.equal(initial.activity.length, 0);
  assert.equal(initial.perParticipantMeanUnits, null);
  assert.equal(initial.occupancyPercent, 0);
  const idle = deriveAuctionAnalytics(
    fixture([row(0, 100, 0, 0), row(1, 200, 1, 100000000)], { windowSeconds: 300 }),
  );
  assert.equal(idle.window.updates, 0);
  assert.equal(idle.window.newParticipants, 0);
  assert.equal(idle.window.committedDeltaUnits, '0');
  assert.equal(idle.window.through, 1000);
  assert.equal(idle.window.complete, true);
});

test('missing and mismatched history retain public totals without fabricating analysis', () => {
  const input = fixture([row(0, 100, 0, 0), row(1, 200, 1, 100000000)]);
  for (const [status, history] of [
    ['missing', undefined],
    ['mismatch', { ...input.history, campaignId: 'other' }],
    ['mismatch', { ...input.history, rulesHash: `0x${'34'.repeat(32)}` }],
  ]) {
    const result = deriveAuctionAnalytics({ ...input, history });
    assert.equal(result.historyStatus, status);
    assert.equal(result.participants, 1);
    assert.equal(result.window.newParticipants, null);
    assert.equal(result.window.committedDeltaUnits, null);
    assert.equal(result.window.complete, false);
    assert.deepEqual(result.activity, []);
    assert.deepEqual(result.participationTrend, []);
  }
  const empty = deriveAuctionAnalytics({ now: 1000, windowSeconds: 300 });
  assert.equal(empty.participants, null);
  assert.equal(empty.bidTransactions, null);
  assert.equal(empty.perParticipantMeanUnits, null);
});

test('negative snapshot changes are signed adjustments and do not become new bids', () => {
  const result = deriveAuctionAnalytics(
    fixture([row(0, 100, 0, 0), row(1, 200, 3, 900000000), row(2, 800, 2, 650000000)], {
      windowSeconds: 300,
    }),
  );
  assert.equal(result.window.newParticipants, -1);
  assert.equal(result.window.committedDeltaUnits, '-250000000');
  assert.equal(result.window.adjustmentCount, 1);
  assert.deepEqual(result.activity[0], {
    timestamp: 800,
    sequence: 2,
    committedDeltaUnits: '-250000000',
    positionsDelta: -1,
    kind: 'adjustment',
    hasGap: false,
  });
  assert.equal(result.window.complete, true);
});

test('history gaps invalidate affected deltas without disguising missing updates as zero', () => {
  const input = fixture([row(0, 100, 0, 0), row(1, 200, 1, 100000000), row(4, 900, 4, 400000000)]);
  const result = deriveAuctionAnalytics(input);
  assert.equal(result.historyStatus, 'incomplete');
  assert.equal(result.window.hasGaps, true);
  assert.equal(result.window.newParticipants, null);
  assert.equal(result.window.committedDeltaUnits, null);
  assert.equal(result.window.updates, 2);
  assert.equal(result.activity[0].hasGap, true);
  assert.equal(result.activity[0].kind, 'adjustment');
  assert.equal(result.activity[0].positionsDelta, 3);
  const afterGap = deriveAuctionAnalytics({ ...input, windowSeconds: 100 });
  assert.equal(afterGap.window.hasGaps, false);
  assert.equal(afterGap.window.newParticipants, 0);
  assert.equal(afterGap.window.complete, true);
});

test('missing initial baseline and incomplete pagination do not invent a total-period delta', () => {
  const input = fixture([row(5, 200, 5, 500000000), row(6, 800, 6, 600000000)]);
  const whole = deriveAuctionAnalytics(input);
  assert.equal(whole.historyStatus, 'incomplete');
  assert.equal(whole.window.newParticipants, null);
  assert.equal(whole.window.updates, 2);
  const recent = deriveAuctionAnalytics({ ...input, windowSeconds: 300 });
  assert.equal(recent.window.newParticipants, 1);
  assert.equal(recent.window.complete, true);
  const paginated = deriveAuctionAnalytics({
    ...input,
    history: { ...input.history, more: true },
    windowSeconds: 300,
  });
  assert.equal(paginated.window.newParticipants, null);
  assert.equal(paginated.window.complete, false);
});

test('independently sampled summary totals never become synthetic history updates', () => {
  const input = fixture([row(0, 100, 0, 0), row(1, 800, 1, 100000000)]);
  const newer = deriveAuctionAnalytics({
    ...input,
    summary: { ...input.summary, positions: 2, committedUnits: '250000000', bidTransactions: 2 },
  });
  assert.equal(newer.participants, 2);
  assert.equal(newer.window.newParticipants, 1);
  assert.equal(newer.window.committedDeltaUnits, '100000000');
  assert.equal(newer.window.updates, 1);
  assert.equal(newer.window.through, 800);
  assert.equal(newer.window.complete, false);
  assert.equal(newer.summaryAhead, true);
  assert.equal(newer.activity.length, 1);
  const older = deriveAuctionAnalytics({
    ...input,
    summary: { ...input.summary, serverTime: 700, positions: 0, committedUnits: '0' },
  });
  assert.equal(older.summaryAhead, false);
  assert.equal(older.window.through, 800);
  assert.equal(older.window.newParticipants, 1);
  assert.equal(older.participants, 0);
  const sameSecond = deriveAuctionAnalytics({
    ...input,
    now: 800,
    summary: { ...input.summary, serverTime: 800, positions: 2, committedUnits: '200000000' },
  });
  assert.equal(sameSecond.summaryAhead, true);
  assert.equal(
    sameSecond.window.complete,
    false,
    'Same-second snapshots can still describe different totals',
  );
});

test('large P20 totals stay exact and occupancy is allowed to exceed capacity', () => {
  const total = '184467440737095516153';
  const result = deriveAuctionAnalytics(fixture([row(0, 100, 0, 0), row(1, 800, 12, total)]));
  assert.equal(result.occupancyPercent, 120);
  assert.equal(result.unfilledSeats, 0);
  assert.equal(result.overCapacity, 2);
  assert.equal(result.perParticipantMeanUnits, String(BigInt(total) / 12n));
  assert.equal(result.window.committedDeltaUnits, total);
  assert.equal(result.activity[0].committedDeltaUnits, total);
  const unavailable = deriveAuctionAnalytics({
    ...fixture([]),
    summary: { ...fixture([]).summary, unavailable: true },
    seats: 0,
  });
  assert.equal(unavailable.participants, null);
  assert.equal(unavailable.occupancyPercent, null);
  assert.equal(unavailable.perParticipantMeanUnits, null);
});

test('duplicate page overlap is deduplicated and conflicting or time-reversed snapshots are rejected', () => {
  const baseline = row(0, 100, 0, 0),
    update = row(1, 200, 1, 100000000);
  const overlap = deriveAuctionAnalytics(fixture([update, baseline, { ...update }]));
  assert.equal(overlap.historyStatus, 'ready');
  assert.equal(overlap.window.updates, 1);
  for (const rows of [
    [baseline, update, { ...update, positions: 2 }],
    [baseline, row(1, 99, 1, 100000000)],
  ]) {
    const invalid = deriveAuctionAnalytics(fixture(rows));
    assert.equal(invalid.historyStatus, 'invalid');
    assert.equal(invalid.window.newParticipants, null);
    assert.deepEqual(invalid.activity, []);
  }
});

test('activity keeps the last twelve observed changes in newest-first sequence order', () => {
  const rows = Array.from({ length: 21 }, (_, sequence) =>
    row(sequence, 100 + sequence * 10, sequence, BigInt(sequence) * 100000000n),
  );
  const result = deriveAuctionAnalytics(fixture(rows));
  assert.equal(result.activity.length, 12);
  assert.deepEqual(
    result.activity.map((activity) => activity.sequence),
    Array.from({ length: 12 }, (_, index) => 20 - index),
  );
  assert.equal(result.window.updates, 20);
  assert.throws(() => deriveAuctionAnalytics({ now: Number.NaN, windowSeconds: 300 }), RangeError);
  assert.throws(() => deriveAuctionAnalytics({ now: 1000, windowSeconds: 0 }), RangeError);
});

test('missing snapshots sharing an endpoint timestamp still invalidate that interval', () => {
  const result = deriveAuctionAnalytics(
    fixture([row(0, 100, 0, 0), row(1, 1000, 1, 100000000), row(4, 1000, 4, 400000000)], {
      windowSeconds: 300,
    }),
  );
  assert.equal(result.window.hasGaps, true);
  assert.equal(result.window.newParticipants, null);
  assert.equal(result.window.complete, false);
});
