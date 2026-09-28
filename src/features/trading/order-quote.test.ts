import { describe, expect, it } from 'vitest';
import type { MarketConfig, OrderBook, OrderLevel } from '@/services/market';
import { decimalUnits, estimateOrder } from './order-quote';

const config: MarketConfig = {
  status: 'ok',
  chainId: 143,
  baseSymbol: 'P20',
  quoteSymbol: 'sUSDC',
  baseDecimals: 6,
  quoteDecimals: 6,
  priceScale: 1000000,
  settlementEnabled: false,
  feeUnits: '500000',
  basePool: `0x${'f'.repeat(40)}`,
  quotePool: `0x${'a'.repeat(40)}`,
  feePool: `0x${'a'.repeat(40)}`,
  priceTick: '100',
  lotSize: '10000',
  persistenceHealthy: true,
};
const level = (priceTicks: string, quantityRaw: string): OrderLevel => ({
  priceTicks,
  quantityRaw,
  price: Number(priceTicks) / 1e6,
  size: Number(quantityRaw) / 1e6,
  total: (Number(priceTicks) * Number(quantityRaw)) / 1e12,
});
const book: OrderBook = {
  bids: [level('1000', '85000000000'), level('800', '50000000000')],
  asks: [level('1300', '19000000000'), level('1400', '120000000000')],
  minFillRaw: '0',
};
const base = {
  config,
  book,
  side: 'sell' as const,
  type: 'market' as const,
  amount: '84000',
  limitPrice: '',
  slippage: '0.5',
};
describe('PEX depth-based order estimates', () => {
  it('quotes 84,000 P20 from the bid book without any VWAP or recent trades', () => {
    expect(estimateOrder(base)).toMatchObject({
      quoteRaw: '84000000',
      quantityRaw: '84000000000',
      remainderRaw: '0',
      feeRaw: '500000',
      feeSymbol: 'sUSDC',
      protectionTicks: '900',
      principalRaw: '84000000000',
    });
  });
  it('does not interpret the official legacy settle_enabled flag as a placement pause', () => {
    expect(() =>
      estimateOrder({ ...base, config: { ...config, settlementEnabled: false } }),
    ).not.toThrow();
  });
  it('keeps the independent fee reserve separate from sale proceeds', () => {
    const quote = estimateOrder(base);
    expect(quote.quoteRaw).toBe('84000000');
    expect(quote.feePool).not.toBe(quote.spendPool);
  });
  it('reports unfillable quantity instead of pricing it at the last trade', () => {
    expect(estimateOrder({ ...base, amount: '90000' })).toMatchObject({
      quoteRaw: '85000000',
      fillableRaw: '85000000000',
      remainderRaw: '5000000000',
    });
  });
  it('walks multiple price levels allowed by the slippage protection', () => {
    expect(estimateOrder({ ...base, amount: '90000', slippage: '25' })).toMatchObject({
      quoteRaw: '89000000',
      remainderRaw: '0',
    });
  });
  it('reserves a market-buy budget at the tick-adjusted cap', () => {
    expect(estimateOrder({ ...base, side: 'buy', amount: '20000' })).toMatchObject({
      quoteRaw: '26100000',
      principalRaw: '28000000',
      protectionTicks: '1400',
    });
  });
  it('quotes a limit order without requiring opposing liquidity', () => {
    expect(
      estimateOrder({ ...base, type: 'limit', limitPrice: '0.0014', book: { ...book, bids: [] } }),
    ).toMatchObject({ quoteRaw: '117600000', protectionTicks: '1400' });
  });
  it('accepts explicit zero slippage', () => {
    expect(estimateOrder({ ...base, slippage: '0.00' }).protectionTicks).toBe('1000');
  });
  it('rejects missing liquidity, invalid precision, grids and slippage', () => {
    for (const patch of [
      { book: { ...book, bids: [] } },
      { amount: '0' },
      { amount: '-1' },
      { amount: '1e6' },
      { amount: '0.000001' },
      { amount: '1.1234567' },
      { slippage: '-1' },
      { slippage: '100' },
      { type: 'limit' as const, limitPrice: '0.00145' },
      { config: { ...config, persistenceHealthy: false } },
    ])
      expect(() => estimateOrder({ ...base, ...patch })).toThrow();
  });
  it('validates minimum fill and missing market metadata', () => {
    expect(() => estimateOrder({ ...base, book: { ...book, minFillRaw: '100000000000' } })).toThrow(
      'Minimum',
    );
    expect(() => estimateOrder({ ...base, config: { ...config, feePool: undefined } })).toThrow(
      'metadata',
    );
  });
  it('preserves quantities exactly and rejects numbers outside the official safe range', () => {
    expect(decimalUnits('1.000001', 6)).toBe(1000001n);
    expect(() => decimalUnits('9007199254740993', 0)).toThrow('range');
  });
});
