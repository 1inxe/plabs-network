import { describe, expect, it } from 'vitest';
import type { DexOrderSummary } from '@/services/wallet';
import { orderGroup, orderStatusLabel } from './order-status';

const order: DexOrderSummary = {
  id: 'local-request',
  side: 'sell',
  type: 'limit',
  quantityRaw: '10000000000',
  priceTicks: '1300',
  createdAt: 1,
  epoch: 'epoch',
  status: 'pending',
  matchedRaw: null,
  pendingRaw: null,
  remainingRaw: null,
};
describe('PEX order classification', () => {
  it('never counts a locally saved request or recovery as a resting order', () => {
    for (const executionState of [
      'prepared',
      'funding',
      'funded',
      'submitting',
      'canceling',
      'recovering',
    ] as const) {
      expect(orderGroup({ ...order, executionState })).toBe('Pending requests');
    }
  });
  it('keeps accepted orders with remaining quantity or settling fills in Open orders', () => {
    expect(orderGroup({ ...order, executionState: 'open' })).toBe('Open orders');
    expect(orderGroup({ ...order, status: 'open' })).toBe('Open orders');
  });
  it('does not infer completion from unavailable or missing matcher state', () => {
    for (const status of ['unavailable', 'not-found', 'previous-epoch'] as const) {
      expect(orderGroup({ ...order, executionState: 'open', status })).toBe('Pending requests');
    }
    expect(orderGroup({ ...order, executionState: 'open', status: 'filled' })).toBe(
      'Order history',
    );
    expect(orderGroup({ ...order, executionState: 'recovered' })).toBe('Order history');
  });
  it('distinguishes funding waits, verified failures and accepted fills', () => {
    expect(orderStatusLabel({ ...order, executionState: 'funding' })).toBe('Confirming funds');
    expect(orderStatusLabel({ ...order, executionState: 'funding', transactionFailed: true })).toBe(
      'Funding failed',
    );
    expect(orderStatusLabel({ ...order, executionState: 'open' })).toBe('Settling fills');
  });
});
