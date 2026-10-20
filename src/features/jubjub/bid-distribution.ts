import type { JubjubHistory, JubjubSummary } from '@/services/platform/jubjub';

type Snapshot = JubjubHistory['rows'][number];
export type BidDistributionBand = {
  id: string;
  label: string;
  minUnits: string;
  maxUnits: string | null;
  includeMax: boolean;
  excludeMin: boolean;
  count: number;
  /** Percentage of the latest history snapshot's funded positions, including unknowns. */
  share: number;
  /** Sum of identifiable first-entry payments, never participants' current totals. */
  entryUnits: string;
};
export type BidDistribution = {
  firstBids: Array<{ sequence: number; amountUnits: string }>;
  /** Complete first-entry observations, independent of a newer live summary. */
  completeFirstBids: boolean;
  bands: BidDistributionBand[];
  classifiedParticipants: number;
  unclassifiedParticipants: number;
  historyParticipants: number | null;
  topUpUpdates: number;
  asOf: number | null;
  status: 'ready' | 'partial' | 'missing' | 'mismatch' | 'invalid' | 'adjusted';
  reason: string | null;
  summaryAhead: boolean;
  coveragePercent: number;
  unclassifiedShare: number;
};

const scale = 1_000_000n;
const reserve = 100n * scale;
const step = 50n * scale;
const definitions = [
  { id: '100-500', label: '100–<500', min: 100n, max: 500n },
  { id: '500-1000', label: '500–<1,000', min: 500n, max: 1000n },
  { id: '1000-5000', label: '1,000–<5,000', min: 1000n, max: 5000n },
  { id: '5000-10000', label: '5,000–<10,000', min: 5000n, max: 10000n },
  { id: '10000-50000', label: '10,000–<50,000', min: 10000n, max: 50000n },
  { id: '50000-100000', label: '50,000–100,000', min: 50000n, max: 100000n, includeMax: true },
  { id: 'over-100000', label: '>100,000', min: 100000n, max: null, excludeMin: true },
] as const;

const share = (count: number, total: number) => (total > 0 ? (count / total) * 100 : 0);
function empty(status: BidDistribution['status'], reason: string): BidDistribution {
  return {
    firstBids: [],
    completeFirstBids: false,
    bands: [],
    classifiedParticipants: 0,
    unclassifiedParticipants: 0,
    historyParticipants: null,
    topUpUpdates: 0,
    asOf: null,
    status,
    reason,
    summaryAhead: false,
    coveragePercent: 0,
    unclassifiedShare: 0,
  };
}
function sameSnapshot(left: Snapshot, right: Snapshot) {
  return (
    left.at === right.at &&
    left.positions === right.positions &&
    left.committedUnits === right.committedUnits &&
    left.averageBidUnits === right.averageBidUnits &&
    left.averageVersion === right.averageVersion &&
    left.highestBidUnits === right.highestBidUnits &&
    left.qualifyingBidUnits === right.qualifyingBidUnits
  );
}
function validSnapshot(row: Snapshot) {
  return (
    Number.isSafeInteger(row.sequence) &&
    row.sequence >= 0 &&
    Number.isSafeInteger(row.at) &&
    row.at > 0 &&
    Number.isSafeInteger(row.positions) &&
    row.positions >= 0 &&
    [row.committedUnits, row.highestBidUnits].every(
      (value) =>
        typeof value === 'string' && value.trim() === value && /^(0|[1-9][0-9]{0,31})$/.test(value),
    )
  );
}

/**
 * Estimate first-entry payments from consecutive public snapshots. Top-ups have
 * no position identifier and can never move a participant to another band.
 * Even complete coverage is an inference, not a current-bid distribution.
 */
export function deriveBidDistribution({
  history,
  summary,
}: {
  history?: JubjubHistory;
  summary?: JubjubSummary;
}): BidDistribution {
  if (!history) return empty('missing', 'First-bid history is not available.');
  if (
    summary &&
    (history.campaignId !== summary.campaignId || history.rulesHash !== summary.rulesHash)
  )
    return empty('mismatch', 'History and totals refer to different campaigns or rules.');
  if (!history.rows.length) return empty('missing', 'No public snapshots are available yet.');
  const unique = new Map<number, Snapshot>();
  for (const row of history.rows) {
    if (!validSnapshot(row)) return empty('invalid', 'A public snapshot contains invalid data.');
    const prior = unique.get(row.sequence);
    if (prior && !sameSnapshot(prior, row))
      return empty('invalid', 'Conflicting public snapshots share the same sequence.');
    unique.set(row.sequence, row);
  }
  const rows = [...unique.values()].sort((left, right) => left.sequence - right.sequence);
  const first = rows[0];
  const last = rows.at(-1);
  if (!first || !last) return empty('missing', 'No public snapshots are available yet.');
  const bands: BidDistributionBand[] = definitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
    minUnits: String(definition.min * scale),
    maxUnits: definition.max === null ? null : String(definition.max * scale),
    includeMax: 'includeMax' in definition,
    excludeMin: 'excludeMin' in definition,
    count: 0,
    share: 0,
    entryUnits: '0',
  }));
  let classifiedParticipants = 0;
  let unclassifiedParticipants = first.positions;
  let topUpUpdates = 0;
  let hasGaps = false;
  const firstBids: BidDistribution['firstBids'] = [];
  const hasBaseline = first.sequence === 0 && first.positions === 0 && first.committedUnits === '0';
  for (let index = 1; index < rows.length; index++) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (!previous || !current) continue;
    if (current.at < previous.at)
      return empty('invalid', 'Public snapshot timestamps moved backwards.');
    const participants = current.positions - previous.positions;
    const amount = BigInt(current.committedUnits) - BigInt(previous.committedUnits);
    if (participants < 0 || amount < 0n)
      return empty(
        'adjusted',
        'Published totals were reduced. The affected participants cannot be assigned to first-bid bands reliably.',
      );
    const gap = current.sequence !== previous.sequence + 1;
    hasGaps ||= gap;
    if (participants === 0) {
      if (!gap && amount > 0n) topUpUpdates++;
      continue;
    }
    if (
      gap ||
      participants !== 1 ||
      amount < reserve ||
      amount % step !== 0n ||
      amount > BigInt(current.highestBidUnits)
    ) {
      unclassifiedParticipants += participants;
      continue;
    }
    const band = bands.find((entry) => {
      const lower = BigInt(entry.minUnits);
      if (entry.excludeMin ? amount <= lower : amount < lower) return false;
      if (entry.maxUnits === null) return true;
      const upper = BigInt(entry.maxUnits);
      return entry.includeMax ? amount <= upper : amount < upper;
    });
    if (!band) return empty('invalid', 'A first-entry payment falls outside the supported bands.');
    band.count++;
    firstBids.push({ sequence: current.sequence, amountUnits: String(amount) });
    band.entryUnits = String(BigInt(band.entryUnits) + amount);
    classifiedParticipants++;
  }
  if (bands.reduce((sum, band) => sum + band.count, unclassifiedParticipants) !== last.positions)
    return empty(
      'invalid',
      'Classified and unknown participants do not reconcile to the history total.',
    );
  const summaryAhead = !!(
    summary &&
    !summary.unavailable &&
    summary.serverTime >= last.at &&
    (summary.positions !== last.positions || summary.committedUnits !== last.committedUnits)
  );
  const reasons = [];
  if (history.more) reasons.push('Only part of the published history has been loaded.');
  if (!hasBaseline)
    reasons.push('The initial zero baseline is missing; pre-existing positions remain unknown.');
  if (hasGaps)
    reasons.push('History has sequence gaps; additions across those gaps remain unknown.');
  if (unclassifiedParticipants > 0)
    reasons.push('Some first-entry amounts cannot be assigned to a band.');
  if (summaryAhead)
    reasons.push(
      'Latest totals have newer changes; this distribution stops at the last history snapshot.',
    );
  return {
    firstBids,
    completeFirstBids: hasBaseline && !hasGaps && !history.more && unclassifiedParticipants === 0,
    bands: bands.map((band) => ({ ...band, share: share(band.count, last.positions) })),
    classifiedParticipants,
    unclassifiedParticipants,
    historyParticipants: last.positions,
    topUpUpdates,
    asOf: last.at,
    status: reasons.length ? 'partial' : 'ready',
    reason: reasons.length ? reasons.join(' ') : null,
    summaryAhead,
    coveragePercent: share(classifiedParticipants, last.positions),
    unclassifiedShare: share(unclassifiedParticipants, last.positions),
  };
}
