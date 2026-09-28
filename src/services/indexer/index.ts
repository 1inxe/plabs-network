import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { createHttpClient } from '@/shared/api/http-client';
import { apiEndpoints } from '@/shared/config/env';
import { poolStatsSchema, publicTxPageSchema, txNotesSchema } from './contracts';
export type IndexerNetwork = 'monad' | 'ethereum';
const schema = z
  .object({ total_transactions: z.number().int().nonnegative() })
  .transform((x) => ({ totalTransactions: x.total_transactions }));
export const indexerService = {
  pools: (network: IndexerNetwork, signal?: AbortSignal) =>
    createHttpClient(apiEndpoints[network]).get('/shield/stats', poolStatsSchema, signal),
  transactions: (network: IndexerNetwork, cursor: number | null, signal?: AbortSignal) =>
    createHttpClient(apiEndpoints[network]).get(
      `/txs?limit=25${cursor !== null ? `&before_block=${cursor}` : ''}`,
      publicTxPageSchema,
      signal,
    ),
  transactionNotes: (network: IndexerNetwork, hash: string, signal?: AbortSignal) =>
    createHttpClient(apiEndpoints[network]).get(
      `/tx?hash=${encodeURIComponent(hash)}`,
      txNotesSchema,
      signal,
    ),
  statistics: (network: IndexerNetwork, signal?: AbortSignal) =>
    createHttpClient(apiEndpoints[network]).get('/stats', schema, signal),
};
export const indexerQueries = {
  pools: (network: IndexerNetwork) =>
    queryOptions({
      queryKey: ['indexer', network, 'pools'],
      queryFn: ({ signal }) => indexerService.pools(network, signal),
      refetchInterval: 60000,
    }),
  transactions: (network: IndexerNetwork) =>
    infiniteQueryOptions({
      queryKey: ['indexer', network, 'transactions'],
      initialPageParam: null as number | null,
      queryFn: ({ pageParam, signal }) => indexerService.transactions(network, pageParam, signal),
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      refetchInterval: 60000,
      maxPages: 8,
    }),
  transactionNotes: (network: IndexerNetwork, hash: string) =>
    queryOptions({
      queryKey: ['indexer', network, 'transaction', hash],
      queryFn: ({ signal }) => indexerService.transactionNotes(network, hash, signal),
      enabled: /^0x[0-9a-f]{64}$/i.test(hash),
    }),
  statistics: (network: IndexerNetwork) =>
    queryOptions({
      queryKey: ['indexer', network, 'statistics'],
      queryFn: ({ signal }) => indexerService.statistics(network, signal),
      refetchInterval: 30000,
    }),
};

export { poolStatsSchema, publicTxPageSchema } from './contracts';
