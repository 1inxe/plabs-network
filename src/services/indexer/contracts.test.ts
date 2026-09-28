import { describe, expect, it } from 'vitest';
import { poolStatsSchema, publicTxPageSchema } from './contracts';

describe('official indexer contracts', () => {
  it('preserves pool units exactly and reads metadata from the official pool record', () => {
    const parsed = poolStatsSchema.parse({
      pools: [
        {
          pool_address: `0x${'a'.repeat(40)}`,
          metadata: { name: 'Shield USDC', symbol: 'sUSDC', decimals: 6, pool_type: 'wrapped' },
          current_shielded_units: '3125209300',
          total_shielded_units: '10052497300',
          total_unshielded_units: '6927288000',
          total_fee_units: '313000000',
        },
      ],
    });
    expect(parsed[0]?.netShieldedRaw).toBe('3125209300');
  });
  it('does not fabricate private amounts and strips ciphertext from public summary DTOs', () => {
    const tx = publicTxPageSchema.parse({
      items: [
        {
          tx_hash: `0x${'b'.repeat(64)}`,
          block_number: 108484339,
          block_time: 1790517866,
          tx_type: 'transfer',
          symbol: 'P20',
          decimals: 6,
          notes: [{ enc_ciphertext: 'opaque' }],
        },
      ],
      next_before_block: 108226472,
    });
    expect(tx.items[0]).toMatchObject({
      publicAmount: null,
      sender: null,
      recipient: null,
      noteCount: 1,
    });
    expect(JSON.stringify(tx)).not.toContain('opaque');
    expect(tx.nextCursor).toBe(108226472);
  });
});
