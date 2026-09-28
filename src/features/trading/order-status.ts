import type { DexOrderSummary } from '@/services/wallet';

export type OrderGroup = 'Open orders' | 'Pending requests' | 'Order history';

export function orderGroup(order: DexOrderSummary): OrderGroup {
  if (['recovered', 'discarded'].includes(order.executionState ?? '')) return 'Order history';
  if (order.executionState && order.executionState !== 'open') return 'Pending requests';
  if (order.status === 'filled') return 'Order history';
  if (['open', 'pending'].includes(order.status)) return 'Open orders';
  return 'Pending requests';
}

export function orderStatusLabel(order: DexOrderSummary): string {
  if (order.transactionFailed) return 'Funding failed';
  switch (order.executionState) {
    case 'prepared':
      return 'Awaiting confirmation';
    case 'funding':
      return 'Confirming funds';
    case 'funded':
      return 'Funds awaiting recovery';
    case 'submitting':
      return 'Confirming placement';
    case 'canceling':
      return 'Canceling order';
    case 'recovering':
      return 'Recovering funds';
    case 'recovered':
      return 'Funds recovered';
    case 'discarded':
      return 'Discarded';
    default:
      return order.status === 'pending' ? 'Settling fills' : order.status;
  }
}
export function fundingStatusLabel(
  state: NonNullable<DexOrderSummary['fundingProgress']>[number]['state'],
) {
  return {
    prepared: 'Not sent',
    confirming: 'Awaiting chain confirmation',
    indexing: 'Awaiting indexer',
    confirmed: 'Confirmed',
    failed: 'Failed',
  }[state];
}
