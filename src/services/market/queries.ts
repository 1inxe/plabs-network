import { queryOptions } from '@tanstack/react-query';
import type { Interval, MarketConfig } from './contracts';
import { marketService } from './market-service';
export const marketQueries = {
  config: () =>
    queryOptions({
      queryKey: ['market', 'config'],
      queryFn: ({ signal }) => marketService.config(signal),
      staleTime: 15000,
      refetchInterval: 30000,
    }),
  stats: () =>
    queryOptions({
      queryKey: ['market', 'stats'],
      queryFn: ({ signal }) => marketService.stats(signal),
      refetchInterval: 30000,
    }),
  book: (config: MarketConfig) =>
    queryOptions({
      queryKey: ['market', 'book', config],
      queryFn: ({ signal }) => marketService.book(config, signal),
      refetchInterval: 15000,
    }),
  candles: (interval: Interval, config: MarketConfig) =>
    queryOptions({
      queryKey: ['market', 'candles', interval, config],
      queryFn: ({ signal }) => marketService.candles(interval, config, signal),
      refetchInterval: 30000,
    }),
};
