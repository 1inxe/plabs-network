import { createHttpClient } from '@/shared/api/http-client';
import { apiEndpoints } from '@/shared/config/env';
import type { Candle, Interval, MarketConfig, OrderBook } from './contracts';
import { bookSchema, candlesSchema, marketConfigSchema, statsSchema } from './contracts';
export function createMarketService(client = createHttpClient(apiEndpoints.market)) {
  return {
    config: (signal?: AbortSignal) => client.get('/healthz', marketConfigSchema, signal),
    stats: (signal?: AbortSignal) => client.get('/market/stats', statsSchema, signal),
    async book(config: MarketConfig, signal?: AbortSignal): Promise<OrderBook> {
      const data = await client.get('/book', bookSchema, signal);
      const normalize = (row: { price: string | number; qty: string | number }) => {
        const price = Number(row.price) / config.priceScale,
          size = Number(row.qty) / 10 ** config.baseDecimals;
        return {
          price,
          size,
          total: price * size,
          priceTicks: String(row.price),
          quantityRaw: String(row.qty),
        };
      };
      return {
        minFillRaw: String(data.min_fill_size ?? 0),
        asks: data.asks
          .map(normalize)
          .sort((a, b) =>
            BigInt(a.priceTicks) < BigInt(b.priceTicks)
              ? -1
              : BigInt(a.priceTicks) > BigInt(b.priceTicks)
                ? 1
                : 0,
          ),
        bids: data.bids
          .map(normalize)
          .sort((a, b) =>
            BigInt(a.priceTicks) > BigInt(b.priceTicks)
              ? -1
              : BigInt(a.priceTicks) < BigInt(b.priceTicks)
                ? 1
                : 0,
          ),
      };
    },
    async candles(
      interval: Interval,
      config: MarketConfig,
      signal?: AbortSignal,
    ): Promise<Candle[]> {
      const data = await client.get(
        `/market/candles/history?interval=${encodeURIComponent(interval)}`,
        candlesSchema,
        signal,
      );
      return [...new Map(data.candles.map((c) => [c.ts, c])).values()]
        .sort((a, b) => a.ts - b.ts)
        .map((c) => ({
          time: Math.floor(c.ts / 1000),
          open: Number(c.open) / config.priceScale,
          high: Number(c.high) / config.priceScale,
          low: Number(c.low) / config.priceScale,
          close: Number(c.close) / config.priceScale,
          volume: Number(c.volume) / 10 ** config.baseDecimals,
        }));
    },
  };
}
export const marketService = createMarketService();
