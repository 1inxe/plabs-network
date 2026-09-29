import { z } from 'zod';

const apiBase = z
  .string()
  .refine(
    (value) => /^\/(?!\/)[a-z0-9/_-]+$/i.test(value) || /^https:\/\//.test(value),
    'Use a same-origin path or an HTTPS URL',
  )
  .transform((value) => value.replace(/\/+$/, ''));
const apiBaseWithDefault = (fallback: string) =>
  z.preprocess((value) => (value === '' ? undefined : value), apiBase.default(fallback));
const schema = z.object({
  VITE_MARKET_API: apiBaseWithDefault('/api/market'),
  VITE_MONAD_API: apiBaseWithDefault('/api/monad'),
  VITE_ETHEREUM_API: apiBaseWithDefault('/api/ethereum'),
  VITE_PLATFORM_API: apiBaseWithDefault('/api/platform'),
});
export const env = schema.parse(import.meta.env);
export const apiEndpoints = {
  market: env.VITE_MARKET_API,
  monad: env.VITE_MONAD_API,
  ethereum: env.VITE_ETHEREUM_API,
  platform: env.VITE_PLATFORM_API,
};
