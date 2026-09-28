import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { createHttpClient } from '@/shared/api/http-client';
import { apiEndpoints } from '@/shared/config/env';

const client = createHttpClient(apiEndpoints.platform);
const usersSchema = z
  .object({ privacy_wallet_users: z.number().int().nonnegative() })
  .transform((x) => ({ users: x.privacy_wallet_users }));
export const campaignSchema = z
  .object({
    campaign_id: z.string(),
    ends_at: z.iso.datetime(),
    closed: z.boolean(),
    submitted_count: z.number().int().nonnegative(),
  })
  .transform((x) => ({
    id: x.campaign_id,
    endsAt: x.ends_at,
    closed: x.closed,
    applicants: x.submitted_count,
  }));
export const platformService = {
  users: (signal?: AbortSignal) => client.get('/wallet/stats', usersSchema, signal),
  campaign: (signal?: AbortSignal) =>
    client.get('/privasea/whitelist/status', campaignSchema, signal),
};
export const platformQueries = {
  users: () =>
    queryOptions({
      queryKey: ['platform', 'users'],
      queryFn: ({ signal }) => platformService.users(signal),
      refetchInterval: 60000,
    }),
  campaign: () =>
    queryOptions({
      queryKey: ['platform', 'whitelist', 'status'],
      queryFn: ({ signal }) => platformService.campaign(signal),
      refetchInterval: 60000,
    }),
};
