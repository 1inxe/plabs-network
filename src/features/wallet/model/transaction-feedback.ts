import type { DexOrderSummary, OperationResult } from '@/services/wallet';

export type TransactionFeedback = {
  kind: 'success' | 'error';
  id: string;
  title: string;
  message: string;
  href: string;
};
export function operationFeedback(
  result: OperationResult,
  previous?: OperationResult,
): TransactionFeedback | null {
  if (result.state === 'pending' || previous?.state === result.state) return null;
  return {
    id: `wallet-tx-${result.id}`,
    kind: result.state === 'confirmed' ? 'success' : 'error',
    title: result.state === 'confirmed' ? 'Transaction confirmed' : 'Transaction failed',
    message:
      result.message ||
      (result.state === 'confirmed'
        ? 'Your wallet confirmed the transaction.'
        : 'The transaction did not complete. Check its details before retrying.'),
    href: '/history?source=session',
  };
}
export function orderFeedback(
  order: DexOrderSummary,
  previous?: DexOrderSummary,
): TransactionFeedback | null {
  if (order.executionState === 'recovered' && previous?.executionState !== 'recovered') {
    return {
      id: `wallet-order-${order.localId ?? order.id}`,
      kind: 'success',
      title: 'Funds recovered',
      message: 'Your wallet confirmed recovery of the remaining order funds.',
      href: '/pex',
    };
  }
  if (
    (order.executionState === 'prepared' || order.transactionFailed) &&
    order.error &&
    order.error !== previous?.error
  ) {
    return {
      id: `wallet-order-${order.localId ?? order.id}`,
      kind: 'error',
      title: 'Order request failed',
      message: order.error,
      href: '/pex',
    };
  }
  // Accepted orders, unknown funding, pending settlement, and read-side diagnostics are not terminal outcomes.
  return null;
}
export function isUserCancellation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 4001;
}
