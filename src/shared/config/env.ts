import { z } from 'zod';

const apiBase = z
  .string()
  .refine(
    (value) => /^\/(?!\/)[a-z0-9/_-]+$/i.test(value) || /^https:\/\//.test(value),
    'Use a same-origin path or an HTTPS URL',
  )
  .transform((value) => value.replace(/\/+$/, ''));
const schema = z.object({
  VITE_MARKET_API: apiBase.default('/api/market'),
  VITE_MONAD_API: apiBase.default('/api/monad'),
  VITE_ETHEREUM_API: apiBase.default('/api/ethereum'),
  VITE_PLATFORM_API: apiBase.default('/api/platform'),
});
export const env = schema.parse(import.meta.env);
export const apiEndpoints = {
  market: env.VITE_MARKET_API,
  monad: env.VITE_MONAD_API,
  ethereum: env.VITE_ETHEREUM_API,
  platform: env.VITE_PLATFORM_API,
};
