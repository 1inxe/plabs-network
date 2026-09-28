import { z } from 'zod';

const decimal = z
  .string()
  .regex(/^\d+(\.\d+)?$/)
  .refine((v) => Number.isFinite(Number(v)));
const integer = z.union([
  z.string().max(78).regex(/^\d+$/),
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
]);
export const marketConfigSchema = z
  .object({
    status: z.string(),
    base: z
      .string()
      .regex(/^0x[0-9a-f]{40}$/i)
      .optional(),
    quote: z
      .string()
      .regex(/^0x[0-9a-f]{40}$/i)
      .optional(),
    fee_pool: z
      .string()
      .regex(/^0x[0-9a-f]{40}$/i)
      .optional(),
    price_tick: integer.optional(),
    lot_size: integer.optional(),
    persistence_healthy: z.boolean().optional(),
    chain_id: z.number().int(),
    base_name: z.string(),
    quote_name: z.string(),
    base_decimals: z.number().int().min(0).max(18),
    quote_decimals: z.number().int().min(0).max(18),
    price_scale: z.number().positive(),
    settle_enabled: z.boolean(),
    fee_units: integer,
  })
  .transform((x) => ({
    chainId: x.chain_id,
    status: x.status,
    basePool: x.base,
    quotePool: x.quote,
    feePool: x.fee_pool,
    priceTick: x.price_tick === undefined ? undefined : String(x.price_tick),
    lotSize: x.lot_size === undefined ? undefined : String(x.lot_size),
    persistenceHealthy: x.persistence_healthy,
    baseSymbol: x.base_name,
    quoteSymbol: x.quote_name,
    baseDecimals: x.base_decimals,
    quoteDecimals: x.quote_decimals,
    priceScale: x.price_scale,
    settlementEnabled: x.settle_enabled,
    feeUnits: String(x.fee_units),
  }));
export const statsSchema = z
  .object({
    as_of_ms: z.number().int().nonnegative(),
    fully_diluted_supply: decimal,
    vwap_24h: decimal.nullable(),
    spot_fdv: decimal.nullable(),
    matched_base_volume_24h: decimal,
    fdv_change_percent: z
      .string()
      .regex(/^[+-]?\d+(\.\d+)?$/)
      .refine((v) => Number.isFinite(Number(v)))
      .nullable(),
  })
  .transform((x) => ({
    asOf: x.as_of_ms,
    supply: Number(x.fully_diluted_supply),
    price: x.vwap_24h === null ? null : Number(x.vwap_24h),
    fdv: x.spot_fdv === null ? null : Number(x.spot_fdv),
    volume: Number(x.matched_base_volume_24h),
    change: x.fdv_change_percent === null ? null : Number(x.fdv_change_percent),
  }));
export const bookSchema = z.object({
  asks: z.array(z.object({ price: integer, qty: integer })),
  bids: z.array(z.object({ price: integer, qty: integer })),
  base_name: z.string(),
  quote_name: z.string(),
  min_fill_size: integer.optional(),
});
export const candlesSchema = z.object({
  as_of_ms: z.number(),
  candles: z.array(
    z.object({
      ts: z.number().int().nonnegative(),
      open: integer,
      high: integer,
      low: integer,
      close: integer,
      volume: integer,
    }),
  ),
});
export type MarketConfig = z.infer<typeof marketConfigSchema>;
export type MarketStats = z.infer<typeof statsSchema>;
export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
export type OrderLevel = {
  price: number;
  size: number;
  total: number;
  priceTicks: string;
  quantityRaw: string;
};
export type OrderBook = { asks: OrderLevel[]; bids: OrderLevel[]; minFillRaw: string };
export const intervals = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
export type Interval = (typeof intervals)[number];
