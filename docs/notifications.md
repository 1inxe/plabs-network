# Transaction-only notifications

The global Notification channel is reserved for meaningful transaction outcomes. It does not announce connection, disconnection, network switching, authorization, clipboard actions, data loading, API polling failures, imports or pending requests.

| Outcome                                                              | Notification                               |
| -------------------------------------------------------------------- | ------------------------------------------ |
| Transfer, deposit or withdrawal confirmed by the wallet              | Success                                    |
| Transaction explicitly failed, or a transaction write request failed | Error                                      |
| User declined/cancelled approval                                     | None                                       |
| Transaction submitted but not confirmed                              | None; retain the pending state in activity |
| PEX order accepted, funds in flight, settlement or recovery pending  | None; retain order status and details      |
| PEX order preparation explicitly rejected before funding             | Error                                      |
| Remaining PEX funds verified as recovered                            | Success                                    |
| Read-only order/payout checks and their diagnostics                  | None                                       |

`features/wallet/model/transaction-feedback.ts` defines terminal outcome classification. WalletStore opts into write-request failure notifications only for transaction actions. Repeated status reads do not announce the same confirmed/failed outcome again. General query/mutation caches and passive wallet state updates do not emit notifications.

The UI component stays reusable, but business integrations must use the channel only after an explicit transaction failure or confirmed outcome. HTTP success, an accepted order, and a matched quantity do not by themselves establish a completed trade. Never report pending settlement as success or failure.

```ts
import { notify } from '@/shared/notifications';

// After a verified terminal transaction result:
notify.success({
  id: `wallet-tx-${result.id}`,
  scope: 'wallet',
  title: 'Transaction confirmed',
  message: 'Your wallet confirmed the transaction.',
  action: { label: 'View activity', href: '/history?source=session' },
});
```

Cards remain fixed at the upper right, 16 px from the right and 88 px from the top, at 384 × 176 px on desktop. Narrow screens use viewport width minus 32 px. Long plain-text details scroll internally. Success messages close after five seconds; errors remain until dismissed. Dismissal never cancels a transaction.

The stable notification portal joins the active dialog's focus scope without losing timers. Messages clear on wallet context changes. Clipboard feedback uses the button/tooltip, authorization uses a compact local status with an optional details disclosure and an open-wallet action, and data failures keep their section's unavailable/retry state. These weak hints never create Notification cards.
