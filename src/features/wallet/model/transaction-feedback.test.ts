import { describe, expect, it } from 'vitest';
import type { DexOrderSummary } from '@/services/wallet';
import { isUserCancellation, operationFeedback, orderFeedback } from './transaction-feedback';

const order = (
  executionState: DexOrderSummary['executionState'],
  error?: string,
): DexOrderSummary => ({
  id: 'order-1',
  localId: 'local-1',
  side: 'sell',
  type: 'limit',
  quantityRaw: '10000',
  priceTicks: '1000',
  createdAt: 1,
  epoch: 'epoch',
  status: 'pending',
  matchedRaw: null,
  pendingRaw: null,
  remainingRaw: null,
  executionState,
  error,
});
describe('transaction notification policy', () => {
  it('announces confirmed or failed transactions, never pending submissions', () => {
    expect(operationFeedback({ id: 'tx', state: 'pending' })).toBeNull();
    expect(operationFeedback({ id: 'tx', state: 'confirmed' })).toMatchObject({
      kind: 'success',
      title: 'Transaction confirmed',
    });
    expect(operationFeedback({ id: 'tx', state: 'failed', message: 'Reverted' })).toMatchObject({
      kind: 'error',
      message: 'Reverted',
    });
  });
  it('does not repeat the same terminal result during status refreshes', () => {
    const confirmed = { id: 'tx', state: 'confirmed' as const };
    expect(operationFeedback(confirmed, confirmed)).toBeNull();
    expect(operationFeedback(confirmed, { id: 'tx', state: 'pending' })).not.toBeNull();
  });
  it('keeps order acceptance, in-flight funds and recovery diagnostics quiet', () => {
    for (const state of [
      'funding',
      'funded',
      'submitting',
      'open',
      'canceling',
      'recovering',
      'discarded',
    ] as const) {
      expect(orderFeedback(order(state, 'Waiting for confirmation or indexer'))).toBeNull();
    }
  });
  it('notifies a verified recovery or an explicit order preparation failure once', () => {
    expect(orderFeedback(order('recovered'))).toMatchObject({
      kind: 'success',
      title: 'Funds recovered',
    });
    expect(orderFeedback(order('recovered'), order('recovered'))).toBeNull();
    const failed = order('prepared', 'Order preflight rejected');
    expect(orderFeedback(failed)).toMatchObject({ kind: 'error', title: 'Order request failed' });
    expect(orderFeedback(failed, failed)).toBeNull();
  });
  it('notifies verified funding failures without notifying ordinary waits', () => {
    const failed = { ...order('funding', 'Funding reverted'), transactionFailed: true };
    expect(orderFeedback(failed)).toMatchObject({ kind: 'error' });
    expect(orderFeedback(failed, failed)).toBeNull();
  });
  it('treats wallet rejection as cancellation, not a transaction error alert', () => {
    expect(isUserCancellation(Object.assign(new Error('Rejected'), { code: 4001 }))).toBe(true);
    expect(isUserCancellation(new Error('Relayer failed'))).toBe(false);
  });
});
