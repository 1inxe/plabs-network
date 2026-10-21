import type { BidDistribution } from './bid-distribution';

const scale = 1_000_000n;
const ranges = [50n, 500n, 1000n, 5000n, 10000n, 50000n];

/** Counts observed updates, never unique bidders or a bidder's second/third bid. */
export function deriveTopUpPeriod(
  distribution: BidDistribution,
  now: number,
  windowSeconds: number | null,
) {
  const from = windowSeconds === null ? 0 : now - windowSeconds;
  const events = distribution.topUps.filter((event) => event.at > from && event.at <= now);
  const totalUnits = events.reduce((sum, event) => sum + BigInt(event.amountUnits), 0n);
  return {
    updates: events.length,
    totalUnits: String(totalUnits),
    bands: ranges.map((lower, index) => {
      const upper = ranges[index + 1];
      const selected = events.filter((event) => {
        const amount = BigInt(event.amountUnits);
        return amount >= lower * scale && (upper === undefined || amount < upper * scale);
      });
      return {
        id: String(lower),
        label:
          upper === undefined
            ? `${lower.toLocaleString('en-US')}+`
            : `${lower.toLocaleString('en-US')}–<${upper.toLocaleString('en-US')}`,
        updates: selected.length,
        units: String(selected.reduce((sum, event) => sum + BigInt(event.amountUnits), 0n)),
      };
    }),
  };
}

export function topUpShare(distribution: BidDistribution): number | null {
  if (distribution.committedUnits === null || BigInt(distribution.committedUnits) === 0n)
    return null;
  const total = BigInt(distribution.committedUnits);
  return Number((BigInt(distribution.topUpUnits) * 1000n + total / 2n) / total) / 10;
}
