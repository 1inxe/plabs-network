import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  ChevronDown,
  Globe2,
  Layers3,
  Send,
  Shield,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supportsAssetAction } from '@/services/wallet';
import { type AssetMode, assetRoute } from '@/shared/config/product';
import { explorerUrl, short } from '@/shared/lib/format';
import { CopyButton, Segmented } from '@/shared/ui';
import { useWallet } from '../model/WalletProvider';
import { WalletBalances } from './WalletBalances';
import { WalletHistory } from './WalletHistory';
import { WalletNotes } from './WalletNotes';

export function WalletDetails() {
  const w = useWallet(),
    navigate = useNavigate();
  const [view, setView] = useState('assets'),
    [fullAddresses, setFullAddresses] = useState(false),
    [notesOpen, setNotesOpen] = useState(false);
  const network = w.capabilities?.networks.find((item) => item.chainId === w.chainId);
  const publicUrl = explorerUrl(w.chainId, w.account);
  useEffect(() => {
    void w.refreshPortfolio();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void w.refreshPortfolio();
    }, 30000);
    return () => clearInterval(id);
  }, [w.refreshPortfolio]);
  const actions: { mode: AssetMode; label: string; Icon: typeof Send }[] = [
    { mode: 'shield', label: 'Deposit', Icon: ArrowDownToLine },
    { mode: 'send', label: 'Transfer', Icon: Send },
    { mode: 'unshield', label: 'Withdraw', Icon: ArrowUpFromLine },
  ];
  return (
    <div className="wallet-details">
      <section className="wallet-accounts" aria-label="Connected wallet addresses">
        <div className="wallet-accounts-toolbar">
          <span>
            <span className="status-dot" />
            Connected accounts
          </span>
          <button
            type="button"
            className="text-button"
            aria-expanded={fullAddresses}
            aria-controls="wallet-addresses"
            onClick={() => setFullAddresses(!fullAddresses)}
          >
            {fullAddresses ? 'Shorten' : 'Full addresses'}
            <ChevronDown aria-hidden="true" size={12} />
          </button>
        </div>
        <div id="wallet-addresses">
          <div className="wallet-address-row private">
            <span className="wallet-address-icon">
              <Shield aria-hidden="true" size={15} />
            </span>
            <div className="wallet-address-value">
              <span>Privacy address</span>
              {w.privacyAddress ? (
                <code title={w.privacyAddress}>
                  {fullAddresses ? w.privacyAddress : short(w.privacyAddress)}
                </code>
              ) : (
                <button
                  type="button"
                  className="text-button"
                  disabled={w.busy}
                  onClick={() => void w.reveal()}
                >
                  Share privacy address
                </button>
              )}
            </div>
            {w.privacyAddress && (
              <CopyButton value={w.privacyAddress} label="Copy privacy address" />
            )}
          </div>
          <div className="wallet-address-row">
            <span className="wallet-address-icon">
              <Globe2 aria-hidden="true" size={15} />
            </span>
            <div className="wallet-address-value">
              <span>Public EVM address</span>
              <code title={w.account}>{fullAddresses ? w.account : short(w.account)}</code>
            </div>
            <CopyButton value={w.account} label="Copy public address" />
            {publicUrl && (
              <a
                className="icon-button"
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="View public transactions"
                title="View public transactions"
              >
                <ArrowUpRight aria-hidden="true" size={15} />
              </a>
            )}
          </div>
        </div>
      </section>
      <section className="wallet-quick-actions" aria-label="Asset actions">
        {actions.map(({ mode, label, Icon }) => (
          <button
            key={mode}
            type="button"
            disabled={w.busy || !supportsAssetAction(w.capabilities, w.chainId, mode)}
            title={
              supportsAssetAction(w.capabilities, w.chainId, mode)
                ? label
                : `${label} is not supported by this wallet on ${network?.name ?? 'this network'}`
            }
            onClick={() => {
              w.setModal(false);
              navigate(assetRoute(mode));
            }}
          >
            <Icon aria-hidden="true" size={15} />
            {label}
          </button>
        ))}
      </section>
      <div className="wallet-drawer-tabs">
        <Segmented
          value={view}
          onChange={setView}
          items={[
            { value: 'assets', label: 'Assets' },
            { value: 'activity', label: 'Activity' },
          ]}
        />
      </div>
      {view === 'assets' ? (
        <>
          <WalletBalances />
          <details
            className="wallet-advanced"
            onToggle={(event) => setNotesOpen(event.currentTarget.open)}
          >
            <summary>
              <Layers3 aria-hidden="true" size={14} />
              <span>
                Private note details<small>Advanced</small>
              </span>
              <ChevronDown aria-hidden="true" size={14} />
            </summary>
            {notesOpen && (
              <>
                <p className="wallet-history-caption">
                  Notes are the spendable units of your private balance. They are not separate
                  assets.
                </p>
                <WalletNotes />
              </>
            )}
          </details>
        </>
      ) : (
        <WalletHistory variant="list" />
      )}
    </div>
  );
}
