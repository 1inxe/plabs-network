import { useQuery } from '@tanstack/react-query';
import { createNftLaunchService } from '@/services/platform/nft-launch';
import { ApiError } from '@/shared/api/errors';
import { apiEndpoints } from '@/shared/config/env';

const service = createNftLaunchService(apiEndpoints.nft);
export function useNftPool(pool: string) {
  return useQuery({
    queryKey: ['nft', 'pool', pool],
    queryFn: ({ signal }) => service.pool(pool, signal),
    staleTime: 5000,
    refetchInterval: 10000,
    retry: (attempt, error) => attempt < 1 && error instanceof ApiError && error.retryable,
    retryDelay: (_attempt, error) =>
      error instanceof ApiError && error.status === 429 ? 10000 : 1000,
  });
}
