import { ArrowUpRight } from 'lucide-react';
import type { PrivacyReadScope } from '@/services/wallet';
import { useWallet } from '../model/WalletProvider';

/** Non-transaction feedback stays beside its control, never in the notification channel. */
export function WalletFeedback({
  scope,
  inDrawer = false,
}: {
  scope?: PrivacyReadScope;
  inDrawer?: boolean;
}) {
  const w = useWallet();
  if (w.modal !== inDrawer || (scope && w.readAuthorizationSource !== scope)) return null;
  const phase = w.readAuthorization;
  const authorizationActive = phase !== 'idle';
  const details =
    (authorizationActive ? w.readAuthorizationError : '') ||
    w.walletOpenError ||
    (!scope && w.errorCategory === 'wallet' ? w.error : '');
  const message =
    phase === 'waiting'
      ? 'Approve access in PLabs Wallet.'
      : phase === 'checking'
        ? 'Checking wallet access…'
        : phase === 'loading'
          ? 'Loading the requested wallet data…'
          : details
            ? 'Wallet access needs attention. You can retry the request.'
            : '';
  if (!message) return null;
  return (
    <div className="wallet-control-feedback">
      <p role="status">{message}</p>
      {details && (
        <details>
          <summary>View details</summary>
          <p>{details}</p>
        </details>
      )}
      {(phase === 'waiting' || details) && (
        <button
          type="button"
          className="text-button"
          disabled={w.openingWallet}
          onClick={() => void w.open()}
        >
          {w.openingWallet ? 'Opening wallet…' : 'Open PLabs Wallet'}
          <ArrowUpRight aria-hidden="true" size={12} />
        </button>
      )}
    </div>
  );
}
