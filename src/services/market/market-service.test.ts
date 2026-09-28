import { describe, expect, it, vi } from 'vitest';
import { createHttpClient } from '@/shared/api/http-client';
import { marketConfigSchema, statsSchema } from './contracts';
import { createMarketService } from './market-service';

const config = {
  chainId: 143,
  status: 'ok',
  basePool: undefined,
  quotePool: undefined,
  feePool: undefined,
  priceTick: undefined,
  lotSize: undefined,
  persistenceHealthy: undefined,
  baseSymbol: 'P20',
  quoteSymbol: 'sUSDC',
  baseDecimals: 8,
  quoteDecimals: 6,
  priceScale: 10000,
  settlementEnabled: false,
  feeUnits: '500000',
};
function service(body: unknown) {
  return createMarketService(
    createHttpClient(
      '/market',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }),
        ),
    ),
  );
}
describe('Market service', () => {
  it('normalizes book units from backend metadata, including alternate decimals', async () => {
    const book = await service({
      asks: [{ price: '25', qty: '100000000' }],
      bids: [{ price: '10', qty: 200000000 }],
      base_name: 'P20',
      quote_name: 'sUSDC',
    }).book(config);
    expect(book.asks[0]).toEqual({
      price: 0.0025,
      size: 1,
      total: 0.0025,
      priceTicks: '25',
      quantityRaw: '100000000',
    });
    expect(book.bids[0]?.size).toBe(2);
  });
  it('sorts and deduplicates candles before they reach the chart', async () => {
    const row = (ts: number, close: string) => ({
      ts,
      open: '10',
      high: '20',
      low: '5',
      close,
      volume: '100000000',
    });
    const candles = await service({
      as_of_ms: 30000,
      candles: [row(20000, '12'), row(10000, '13'), row(10000, '14')],
    }).candles('15m', config);
    expect(candles.map((c) => c.time)).toEqual([10, 20]);
    expect(candles[0]?.close).toBe(0.0014);
    expect(candles[0]?.volume).toBe(1);
  });
  it('preserves absent market values instead of displaying fake zeroes', () => {
    const stats = statsSchema.parse({
      as_of_ms: 100,
      fully_diluted_supply: '1000000',
      vwap_24h: null,
      spot_fdv: null,
      matched_base_volume_24h: '0',
      fdv_change_percent: null,
    });
    expect(stats.price).toBeNull();
    expect(stats.fdv).toBeNull();
    expect(stats.volume).toBe(0);
  });
  it('validates live metadata and numeric conversions', async () => {
    const raw = {
      status: 'ok',
      chain_id: 143,
      base_name: 'P20',
      quote_name: 'sUSDC',
      base_decimals: 6,
      quote_decimals: 6,
      price_scale: 1000000,
      settle_enabled: false,
      fee_units: 500000,
    };
    expect(await service(raw).config()).toEqual({
      ...config,
      baseDecimals: 6,
      priceScale: 1000000,
    });
    expect(marketConfigSchema.safeParse({ ...raw, base_decimals: 100 }).success).toBe(false);
    const stats = await service({
      as_of_ms: 1,
      fully_diluted_supply: '1000000000',
      vwap_24h: '0.001',
      spot_fdv: '1000000',
      matched_base_volume_24h: '112000',
      fdv_change_percent: '-8.7',
    }).stats();
    expect(stats.change).toBe(-8.7);
    expect(stats.price).toBe(0.001);
  });
});

it('accepts the signed positive change returned when the market rises', () => {
  const result = statsSchema.parse({
    as_of_ms: 1790517414000,
    fully_diluted_supply: '1000000000',
    vwap_24h: null,
    spot_fdv: '1150000',
    matched_base_volume_24h: '0',
    fdv_change_percent: '+9.5238',
  });
  expect(result.change).toBe(9.5238);
  expect(result.price).toBeNull();
  expect(result.fdv).toBe(1150000);
});
