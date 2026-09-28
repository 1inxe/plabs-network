import type { MarketConfig, OrderBook } from '@/services/market';
import { formatRaw } from '@/shared/lib/format';
export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';
export type OrderEstimate = {
  quantityRaw: string;
  quoteRaw: string;
  protectionTicks: string;
  fillableRaw: string;
  remainderRaw: string;
  worstQuoteRaw: string;
  feeRaw: string;
  feeDecimals: number;
  feeSymbol: string;
  feePool: string;
  spendPool: string;
  principalRaw: string;
  spendSymbol: string;
  priceDecimals: number;
};
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;
export function decimalUnits(input: string, decimals: number): bigint {
  if (
    input.length > 80 ||
    !/^\d+(\.\d+)?$/.test(input) ||
    !Number.isSafeInteger(decimals) ||
    decimals < 0 ||
    decimals > 18
  )
    throw new Error('Enter a positive decimal amount.');
  const [whole = '0', fraction = ''] = input.split('.');
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places.`);
  const units =
    BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (units <= 0n) throw new Error('Enter an amount greater than zero.');
  if (units > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('This order exceeds the market’s supported quantity range.');
  return units;
}
export function estimateOrder({
  config,
  book,
  side,
  type,
  amount,
  limitPrice,
  slippage,
}: {
  config: MarketConfig;
  book: OrderBook;
  side: OrderSide;
  type: OrderType;
  amount: string;
  limitPrice: string;
  slippage: string;
}): OrderEstimate {
  if (
    !config.basePool ||
    !config.quotePool ||
    !config.feePool ||
    !config.priceTick ||
    !config.lotSize
  )
    throw new Error(
      'The market did not provide complete asset and order-grid metadata. Refresh the market.',
    );
  if (config.status !== 'ok' || config.persistenceHealthy === false)
    throw new Error('The official matching service is unavailable. Retry when it recovers.');
  // The official frontend does not use settle_enabled as an order-placement gate.
  const priceDecimals = String(config.priceScale).length - 1;
  if (!/^10*$/.test(String(config.priceScale))) throw new Error('Unsupported market price scale.');
  const quantity = decimalUnits(amount, config.baseDecimals),
    lot = BigInt(config.lotSize),
    tick = BigInt(config.priceTick);
  if (lot <= 0n || tick <= 0n) throw new Error('Invalid order-grid metadata.');
  if (quantity % lot !== 0n)
    throw new Error(
      `Amount must be a multiple of ${formatRaw(lot.toString(), config.baseDecimals)} ${config.baseSymbol}.`,
    );
  if (quantity < BigInt(book.minFillRaw))
    throw new Error(
      `Minimum order size is ${formatRaw(book.minFillRaw, config.baseDecimals)} ${config.baseSymbol}.`,
    );
  const baseScale = 10n ** BigInt(config.baseDecimals),
    quoteScale = 10n ** BigInt(config.quoteDecimals),
    priceScale = BigInt(config.priceScale);
  const quoteFor = (qty: bigint, price: bigint) =>
    side === 'buy'
      ? ceilDiv(qty * price * quoteScale, priceScale * baseScale)
      : (qty * price * quoteScale) / (priceScale * baseScale);
  let protection: bigint,
    quote = 0n,
    remaining = quantity;
  if (type === 'limit') {
    protection = decimalUnits(limitPrice, priceDecimals);
    if (protection % tick !== 0n)
      throw new Error(
        `Price must be a multiple of ${formatRaw(tick.toString(), priceDecimals)} ${config.quoteSymbol}.`,
      );
    quote = quoteFor(quantity, protection);
    remaining = 0n;
  } else {
    if (!/^\d+(\.\d{1,2})?$/.test(slippage))
      throw new Error('Slippage must be between 0 and 99.99%, with at most two decimal places.');
    const bps = /^0+(?:\.0{1,2})?$/.test(slippage) ? 0n : decimalUnits(slippage, 2);
    if (bps >= 10000n) throw new Error('Slippage must be below 100%.');
    const levels = (side === 'sell' ? book.bids : book.asks).filter(
      (row) => BigInt(row.quantityRaw) > 0n && BigInt(row.priceTicks) > 0n,
    );
    const best = levels[0];
    if (!best)
      throw new Error(
        `No ${side === 'sell' ? 'buy' : 'sell'} liquidity is available for this market order.`,
      );
    const top = BigInt(best.priceTicks),
      numerator = top * (side === 'sell' ? 10000n - bps : 10000n + bps);
    protection =
      side === 'sell'
        ? (numerator / 10000n / tick) * tick
        : ceilDiv(ceilDiv(numerator, 10000n), tick) * tick;
    if (protection <= 0n) protection = tick;
    for (const row of levels) {
      const price = BigInt(row.priceTicks);
      if (side === 'sell' ? price < protection : price > protection) break;
      const size = BigInt(row.quantityRaw),
        fill = remaining < size ? remaining : size;
      quote += quoteFor(fill, price);
      remaining -= fill;
      if (remaining === 0n) break;
    }
  }
  const feeIsBase = config.feePool.toLowerCase() === config.basePool.toLowerCase(),
    feeIsQuote = config.feePool.toLowerCase() === config.quotePool.toLowerCase();
  if (!feeIsBase && !feeIsQuote) throw new Error('The fee asset is not part of this market.');
  const principal = side === 'sell' ? quantity : quoteFor(quantity, protection);
  return {
    quantityRaw: quantity.toString(),
    quoteRaw: quote.toString(),
    protectionTicks: protection.toString(),
    fillableRaw: (quantity - remaining).toString(),
    remainderRaw: remaining.toString(),
    worstQuoteRaw: quoteFor(quantity, protection).toString(),
    feeRaw: config.feeUnits,
    feePool: config.feePool,
    feeSymbol: feeIsBase ? config.baseSymbol : config.quoteSymbol,
    feeDecimals: feeIsBase ? config.baseDecimals : config.quoteDecimals,
    spendPool: side === 'sell' ? config.basePool : config.quotePool,
    spendSymbol: side === 'sell' ? config.baseSymbol : config.quoteSymbol,
    principalRaw: principal.toString(),
    priceDecimals,
  };
}
