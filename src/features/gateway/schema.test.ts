import { describe, expect, it } from 'vitest';
import { gatewaySchema } from './schema';

const intent = { mode: 'shield', amount: '0.000000000000000001', pool: 'pool', recipient: '' };
describe('Gateway intent validation', () => {
  it('keeps exact decimal strings through validation', () =>
    expect(gatewaySchema.parse(intent).amount).toBe(intent.amount));
  it('requires a recipient only for private transfers', () => {
    expect(gatewaySchema.safeParse({ ...intent, mode: 'send' }).success).toBe(false);
    expect(
      gatewaySchema.safeParse({ ...intent, mode: 'send', recipient: `perc1${'a'.repeat(24)}` })
        .success,
    ).toBe(true);
    expect(gatewaySchema.safeParse({ ...intent, mode: 'unshield' }).success).toBe(true);
  });
  it('rejects negative amounts and unsupported modes', () => {
    expect(gatewaySchema.safeParse({ ...intent, amount: '-1' }).success).toBe(false);
    expect(gatewaySchema.safeParse({ ...intent, mode: 'mint' }).success).toBe(false);
  });
});
