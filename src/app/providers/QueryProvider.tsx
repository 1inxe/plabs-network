import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { ApiError } from '@/shared/api/errors';
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15000,
        gcTime: 300000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: (count, error) => count < 2 && error instanceof ApiError && error.retryable,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      },
      mutations: { retry: false },
    },
  });
}
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
