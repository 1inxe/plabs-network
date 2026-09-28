import { z } from 'zod';

const hash = z.string().regex(/^0x[0-9a-f]{64}$/i);
const address = z.string().regex(/^0x[0-9a-f]{40}$/i);
const units = z.string().max(78).regex(/^\d+$/);
export const poolStatsSchema = z
  .object({
    pools: z.array(
      z.object({
        pool_address: address,
        metadata: z.object({
          name: z.string(),
          symbol: z.string(),
          decimals: z.number().int().min(0).max(36),
          pool_type: z.string(),
        }),
        current_shielded_units: units,
        total_shielded_units: units,
        total_unshielded_units: units,
        total_fee_units: units,
      }),
    ),
  })
  .transform((data) =>
    data.pools.map((row) => ({
      address: row.pool_address,
      name: row.metadata.name,
      symbol: row.metadata.symbol,
      decimals: row.metadata.decimals,
      type: row.metadata.pool_type,
      netShieldedRaw: row.current_shielded_units,
      shieldedRaw: row.total_shielded_units,
      unshieldedRaw: row.total_unshielded_units,
      feesRaw: row.total_fee_units,
    })),
  );
export const publicTxSchema = z
  .object({
    tx_hash: hash,
    block_number: z.number().int().nonnegative(),
    block_time: z.number().nullable().optional(),
    tx_type: z.string().nullish(),
    symbol: z.string().nullish(),
    decimals: z.number().int().min(0).max(36).nullish(),
    public_amount: z.union([units, z.string().regex(/^0x[0-9a-f]+$/i)]).nullish(),
    public_sender: address.nullish(),
    public_recipient: address.nullish(),
    notes: z.array(z.unknown()).optional(),
  })
  .transform((row) => ({
    hash: row.tx_hash,
    block: row.block_number,
    time: row.block_time ? row.block_time * 1000 : null,
    type: row.tx_type ?? 'private',
    symbol: row.symbol ?? '',
    decimals: row.decimals ?? 0,
    publicAmount: row.public_amount?.startsWith('0x')
      ? BigInt(row.public_amount).toString()
      : (row.public_amount ?? null),
    sender: row.public_sender ?? null,
    recipient: row.public_recipient ?? null,
    noteCount: row.notes?.length ?? 0,
  }));
export const publicTxPageSchema = z
  .object({
    items: z.array(publicTxSchema),
    next_before_block: z.number().int().nullable().optional(),
  })
  .transform((data) => ({ items: data.items, nextCursor: data.next_before_block ?? null }));
export const txNotesSchema = z.array(
  z.object({
    cmx: hash,
    pool: address.optional(),
    symbol: z.string().optional(),
    decimals: z.number().int().optional(),
  }),
);
