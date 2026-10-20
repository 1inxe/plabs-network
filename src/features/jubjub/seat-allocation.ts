import type { BidDistribution, BidDistributionBand } from './bid-distribution';

export type SeatBand = BidDistributionBand & {
  retained: number;
  outside: number;
  retainedUnits: string;
  state: 'retained' | 'outside' | 'mixed' | 'empty';
};
export type RetainedBand = {
  id: string;
  label: string;
  count: number;
  share: number;
  units: string;
  atCutoff: boolean;
};
export type SeatAllocation = {
  status: 'ready' | 'unavailable';
  reason: string | null;
  seats: number | null;
  retainedCount: number;
  outsideCount: number;
  openSeats: number;
  cutoffUnits: string | null;
  aboveCutoffCount: number;
  atCutoffCount: number;
  belowCutoffCount: number;
  cutoffSeats: number;
  contested: boolean;
  retainedUnits: string;
  bands: SeatBand[];
  retainedBands: RetainedBand[];
};
const scale = 1_000_000n;
const price = (units: bigint) => (units / scale).toLocaleString('en-US');
const contains = (band: BidDistributionBand, value: bigint) =>
  (band.excludeMin ? value > BigInt(band.minUnits) : value >= BigInt(band.minUnits)) &&
  (band.maxUnits === null ||
    (band.includeMax ? value <= BigInt(band.maxUnits) : value < BigInt(band.maxUnits)));

/** Highest first-entry amounts fill seat slots. This cannot identify live winners:
 * anonymous top-ups and the campaign's tie-break are not recoverable from history. */
export function deriveSeatAllocation({
  distribution,
  seats,
  summarySeats,
}: {
  distribution: BidDistribution;
  seats?: number;
  summarySeats?: number;
}): SeatAllocation {
  const base: SeatAllocation = {
    status: 'unavailable',
    reason: null,
    seats: seats ?? null,
    retainedCount: 0,
    outsideCount: 0,
    openSeats: 0,
    cutoffUnits: null,
    aboveCutoffCount: 0,
    atCutoffCount: 0,
    belowCutoffCount: 0,
    cutoffSeats: 0,
    contested: false,
    retainedUnits: '0',
    bands: [],
    retainedBands: [],
  };
  if (!Number.isSafeInteger(seats) || seats === undefined || seats < 1 || seats > 100_000)
    return { ...base, reason: 'Waiting for the verified auction seat count.' };
  if (summarySeats !== undefined && summarySeats !== seats)
    return { ...base, reason: 'Seat counts differ between the campaign and live totals.' };
  if (
    !distribution.completeFirstBids ||
    distribution.firstBids.length !== distribution.historyParticipants
  )
    return {
      ...base,
      reason: 'A complete first-bid history is needed to estimate which prices fill the seats.',
    };
  const ranked = [...distribution.firstBids].sort((a, b) => {
    const left = BigInt(a.amountUnits),
      right = BigInt(b.amountUnits);
    return left === right ? a.sequence - b.sequence : left > right ? -1 : 1;
  });
  // The sequence only makes equal-price arithmetic deterministic. It is never
  // presented as the real tie-break or an individual allocation.
  const retained = ranked.slice(0, seats);
  const cutoffUnits = retained.at(-1)?.amountUnits ?? null;
  const cutoff = cutoffUnits === null ? null : BigInt(cutoffUnits);
  const overCapacity = ranked.length > seats;
  const above = cutoff === null ? 0 : ranked.filter((b) => BigInt(b.amountUnits) > cutoff).length;
  const tied = cutoff === null ? 0 : ranked.filter((b) => BigInt(b.amountUnits) === cutoff).length;
  const cutoffSeats = retained.length - above;
  const contested = overCapacity && tied > cutoffSeats;
  const bands = distribution.bands
    .map((band): SeatBand => {
      const selected = retained.filter((bid) => contains(band, BigInt(bid.amountUnits)));
      return {
        ...band,
        retained: selected.length,
        outside: band.count - selected.length,
        retainedUnits: String(selected.reduce((sum, bid) => sum + BigInt(bid.amountUnits), 0n)),
        state:
          band.count === 0
            ? 'empty'
            : selected.length === 0
              ? 'outside'
              : selected.length === band.count
                ? 'retained'
                : 'mixed',
      };
    })
    .reverse();
  // Split the busy 5k–10k range into 1k slices for retained-seat analysis.
  const fine = distribution.bands.flatMap((band): BidDistributionBand[] =>
    band.id !== '5000-10000'
      ? [band]
      : Array.from({ length: 5 }, (_, i) => ({
          ...band,
          id: `retained-${5000 + i * 1000}-${6000 + i * 1000}`,
          label: '',
          minUnits: String(BigInt(5000 + i * 1000) * scale),
          maxUnits: String(BigInt(6000 + i * 1000) * scale),
        })),
  );
  const retainedBands = fine
    .flatMap((band): RetainedBand[] => {
      const selected = retained.filter((bid) => contains(band, BigInt(bid.amountUnits)));
      if (!selected.length) return [];
      const lower =
        cutoff !== null && cutoff > BigInt(band.minUnits) ? cutoff : BigInt(band.minUnits);
      const upper = band.maxUnits === null ? null : BigInt(band.maxUnits);
      const label =
        upper === null
          ? band.excludeMin && lower === BigInt(band.minUnits)
            ? `>${price(lower)}`
            : `${price(lower)}+`
          : lower === upper
            ? price(lower)
            : `${price(lower)}–${band.includeMax ? '' : '<'}${price(upper)}`;
      return [
        {
          id: band.id,
          label,
          count: selected.length,
          share: retained.length ? (selected.length / retained.length) * 100 : 0,
          units: String(selected.reduce((sum, bid) => sum + BigInt(bid.amountUnits), 0n)),
          atCutoff: overCapacity && cutoff !== null && contains(band, cutoff),
        },
      ];
    })
    .reverse();
  return {
    ...base,
    status: 'ready',
    seats,
    retainedCount: retained.length,
    outsideCount: ranked.length - retained.length,
    openSeats: Math.max(0, seats - ranked.length),
    cutoffUnits,
    aboveCutoffCount: above,
    atCutoffCount: tied,
    belowCutoffCount: ranked.length - above - tied,
    cutoffSeats,
    contested,
    retainedUnits: String(retained.reduce((sum, bid) => sum + BigInt(bid.amountUnits), 0n)),
    bands,
    retainedBands,
  };
}
