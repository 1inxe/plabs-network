import type { JubjubHistory, JubjubSummary } from '@/services/platform/jubjub';

type Snapshot = JubjubHistory['rows'][number];

export type AuctionActivity = {
  timestamp: number;
  sequence: number;
  committedDeltaUnits: string;
  positionsDelta: number;
  kind: 'new-bidders' | 'increase' | 'adjustment';
  /** A difference across missing snapshots cannot be attributed to one update. */
  hasGap: boolean;
};

export type ParticipationPoint = { at: number; sequence: number | null; positions: number };

export type AuctionAnalytics = {
  participants: number | null;
  bidTransactions: number | null;
  committedUnits: string | null;
  seats: number | null;
  occupancyPercent: number | null;
  unfilledSeats: number | null;
  overCapacity: number | null;
  perParticipantMeanUnits: string | null;
  historyStatus: 'ready' | 'missing' | 'mismatch' | 'incomplete' | 'invalid';
  window: {
    from: number;
    to: number;
    baselineAt: number | null;
    through: number | null;
    complete: boolean;
    /** Net change in funded positions; it may decrease during an adjustment. */
    newParticipants: number | null;
    committedDeltaUnits: string | null;
    updates: number;
    adjustmentCount: number;
    hasGaps: boolean;
  };
  activity: AuctionActivity[];
  participationTrend: ParticipationPoint[];
  /** Summary is newer and disagrees with history; it is not a synthetic history event. */
  summaryAhead: boolean;
};

function sameSnapshot(left: Snapshot, right: Snapshot) {
  return (
    left.at === right.at &&
    left.committedUnits === right.committedUnits &&
    left.positions === right.positions &&
    left.averageBidUnits === right.averageBidUnits &&
    left.averageVersion === right.averageVersion &&
    left.highestBidUnits === right.highestBidUnits &&
    left.qualifyingBidUnits === right.qualifyingBidUnits
  );
}

/** All timestamps are Unix seconds. A selected interval is (from, now]. */
export function deriveAuctionAnalytics({
  summary,
  history,
  seats,
  now,
  windowSeconds,
  startsAt,
}: {
  summary?: JubjubSummary;
  history?: JubjubHistory;
  seats?: number;
  now: number;
  windowSeconds: number | null;
  startsAt?: number;
}): AuctionAnalytics {
  if (
    !Number.isSafeInteger(Math.floor(now)) ||
    now < 0 ||
    (windowSeconds !== null && (!Number.isFinite(windowSeconds) || windowSeconds <= 0)) ||
    (startsAt !== undefined && (!Number.isFinite(startsAt) || startsAt < 0))
  )
    throw new RangeError('Auction analytics requires Unix seconds and a positive time window.');

  const totals = summary?.unavailable ? undefined : summary;
  const participants = totals?.positions ?? null;
  const candidateSeats = seats ?? totals?.auctionSeats;
  const seatCount =
    candidateSeats !== undefined && Number.isSafeInteger(candidateSeats) && candidateSeats > 0
      ? candidateSeats
      : null;
  let historyStatus: AuctionAnalytics['historyStatus'] = 'ready';
  let rows: Snapshot[] = [];
  if (!history?.rows.length) historyStatus = 'missing';
  else if (
    summary &&
    (history.campaignId !== summary.campaignId || history.rulesHash !== summary.rulesHash)
  )
    historyStatus = 'mismatch';
  else {
    const unique = new Map<number, Snapshot>();
    for (const row of history.rows) {
      const previous = unique.get(row.sequence);
      if (previous && !sameSnapshot(previous, row)) {
        historyStatus = 'invalid';
        break;
      }
      unique.set(row.sequence, row);
    }
    if (historyStatus !== 'invalid') {
      rows = [...unique.values()].sort((left, right) => left.sequence - right.sequence);
      if (rows.some((row, index) => index > 0 && row.at < (rows[index - 1]?.at ?? 0))) {
        rows = [];
        historyStatus = 'invalid';
      } else rows = rows.filter((row) => row.at <= now);
      if (!rows.length && historyStatus !== 'invalid') historyStatus = 'missing';
    }
  }

  const first = rows[0];
  const last = rows.at(-1);
  const requestedFrom =
    windowSeconds === null ? (startsAt ?? first?.at ?? now) : now - windowSeconds;
  const from = Math.min(now, Math.max(0, requestedFrom, startsAt ?? 0));
  const transitions: Array<{ previous: Snapshot; current: Snapshot; activity: AuctionActivity }> =
    [];
  for (let index = 1; index < rows.length; index++) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (!previous || !current) continue;
    const committedDelta = BigInt(current.committedUnits) - BigInt(previous.committedUnits);
    const positionsDelta = current.positions - previous.positions;
    const hasGap = current.sequence !== previous.sequence + 1;
    const kind =
      hasGap ||
      positionsDelta < 0 ||
      committedDelta < 0n ||
      (positionsDelta === 0 && committedDelta === 0n)
        ? 'adjustment'
        : positionsDelta > 0
          ? 'new-bidders'
          : 'increase';
    transitions.push({
      previous,
      current,
      activity: {
        timestamp: current.at,
        sequence: current.sequence,
        committedDeltaUnits: String(committedDelta),
        positionsDelta,
        kind,
        hasGap,
      },
    });
  }
  if (
    historyStatus === 'ready' &&
    (history?.more || first?.sequence !== 0 || transitions.some(({ activity }) => activity.hasGap))
  )
    historyStatus = 'incomplete';

  const summaryAhead = !!(
    totals &&
    last &&
    totals.serverTime >= last.at &&
    (totals.positions !== last.positions || totals.committedUnits !== last.committedUnits)
  );
  // A later summary with the same totals can confirm an idle tail. Never append
  // summary totals as an update: its request races independently with history.
  const through = last
    ? Math.min(now, totals && !summaryAhead ? Math.max(last.at, totals.serverTime) : last.at)
    : null;
  const gaps = transitions.filter(({ activity }) => activity.hasGap);
  const baselineFor = (begin: number, end: number) => {
    for (let index = rows.length - 1; index >= 0; index--) {
      const row = rows[index];
      if (row && row.at <= begin) return row;
    }
    // Sequence zero is a baseline, never an observed bid/update. A window that
    // includes the campaign's start can use it without inventing an extra bid.
    return first?.sequence === 0 && first.at <= end ? first : undefined;
  };
  const interval = (begin: number, end: number) => {
    const baseline = baselineFor(begin, end);
    const inWindow = transitions.filter(({ current }) => current.at > begin && current.at <= end);
    const hasGaps = gaps.some(
      ({ previous, current }) => current.at > begin && (current.at <= end || previous.at < end),
    );
    const observed = rows.filter((row) => row.sequence !== 0 && row.at > begin && row.at <= end);
    const ending = inWindow.at(-1)?.current ?? baseline;
    const comparable = !!baseline && !!ending && !hasGaps && !history?.more;
    return {
      baseline,
      ending,
      inWindow,
      updates: observed.length,
      hasGaps,
      complete: comparable && !summaryAhead,
      positionsDelta: comparable ? ending.positions - baseline.positions : null,
      committedDeltaUnits: comparable
        ? String(BigInt(ending.committedUnits) - BigInt(baseline.committedUnits))
        : null,
    };
  };
  const selected = interval(from, now);
  const participationTrend: ParticipationPoint[] = [];
  if (selected.baseline && selected.baseline.at <= from)
    participationTrend.push({ at: from, sequence: null, positions: selected.baseline.positions });
  for (const row of rows) {
    if (row.at > from && row.at <= now)
      participationTrend.push({ at: row.at, sequence: row.sequence, positions: row.positions });
  }

  return {
    participants,
    bidTransactions: totals?.bidTransactions ?? null,
    committedUnits: totals?.committedUnits ?? null,
    seats: seatCount,
    occupancyPercent:
      participants !== null && seatCount !== null ? (participants / seatCount) * 100 : null,
    unfilledSeats:
      participants !== null && seatCount !== null ? Math.max(0, seatCount - participants) : null,
    overCapacity:
      participants !== null && seatCount !== null ? Math.max(0, participants - seatCount) : null,
    perParticipantMeanUnits:
      totals && totals.positions > 0
        ? String(BigInt(totals.committedUnits) / BigInt(totals.positions))
        : null,
    historyStatus,
    window: {
      from,
      to: now,
      baselineAt: selected.baseline?.at ?? null,
      through,
      complete: selected.complete,
      newParticipants: selected.positionsDelta,
      committedDeltaUnits: selected.committedDeltaUnits,
      updates: selected.updates,
      adjustmentCount: selected.inWindow.filter(({ activity }) => activity.kind === 'adjustment')
        .length,
      hasGaps: selected.hasGaps,
    },
    activity: selected.inWindow
      .map(({ activity }) => activity)
      .slice(-12)
      .reverse(),
    participationTrend,
    summaryAhead,
  };
}
