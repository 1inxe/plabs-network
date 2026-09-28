import {
  ArrowDown,
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  LockKeyhole,
  Shield,
  Unlock,
  Wallet,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Activity } from '@/features/wallet';
import { supportsAssetAction } from '@/services/wallet';
import { activityLabels, assetModeFromQuery, assetModes } from '@/shared/config/product';
import { short, validAmount } from '@/shared/lib/format';
import { Badge, CopyButton, EmptyState, Notice, PageHeading, Panel, Segmented } from '@/shared/ui';
import { Button } from '@/shared/ui/Button';
import { GatewayAside } from './GatewayAside';
import { useGatewayForm } from './useGatewayForm';

const modes = [
  {
    value: 'shield',
    label: (
      <>
        <Shield aria-hidden="true" size={16} />
        Deposit
      </>
    ),
  },
  {
    value: 'send',
    label: (
      <>
        <ArrowLeftRight aria-hidden="true" size={16} />
        Private transfer
      </>
    ),
  },
  {
    value: 'unshield',
    label: (
      <>
        <Unlock aria-hidden="true" size={16} />
        Withdraw
      </>
    ),
  },
];
export function Gateway() {
  const [params, setParams] = useSearchParams();
  const mode = assetModeFromQuery(params.get('mode'));
  return (
    <AssetForm
      key={mode}
      initialMode={mode}
      onModeChange={(next) => setParams({ mode: assetModes[next].query })}
    />
  );
}
function AssetForm({
  initialMode,
  onModeChange,
}: {
  initialMode: Activity['kind'];
  onModeChange: (mode: Activity['kind']) => void;
}) {
  const {
    w,
    form,
    mode,
    amount,
    recipient,
    review,
    network,
    pools,
    selected,
    canSubmit,
    availableLabel,
    outputSymbol,
    precisionError,
    setPercentage,
    submit,
    setAmount,
    setPool,
    setRecipient,
  } = useGatewayForm(initialMode);
  return (
    <div className="page gateway-page">
      <PageHeading
        eyebrow="PUBLIC & PRIVATE ASSETS"
        title="Assets"
        description="Deposit, transfer privately or withdraw. One place to manage your assets."
        action={
          <a className="secondary-button" href="#lifecycle">
            <CircleHelp aria-hidden="true" size={15} />
            How it works
          </a>
        }
      />
      <div className="gateway-grid">
        <div>
          <Panel className="transaction-panel">
            <Segmented
              value={mode}
              onChange={(v) => onModeChange(v as Activity['kind'])}
              items={modes.map((item) => ({
                ...item,
                disabled:
                  !!w.account &&
                  !supportsAssetAction(w.capabilities, w.chainId, item.value as Activity['kind']),
                reason: `Not supported by your wallet on ${network?.name ?? 'this network'}.`,
              }))}
            />
            <p className="asset-mode-description">{assetModes[mode].description}</p>
            <div className="network-row">
              <span>Network</span>
              <strong>
                <span className="network-mark">◈</span>
                {network?.name || 'Select in wallet'}
              </strong>
            </div>
            <div className="asset-input">
              <div className="input-caption">
                <span>
                  FROM{' '}
                  <Badge tone={mode === 'shield' ? 'amber' : 'green'}>
                    {mode === 'shield' ? 'PUBLIC WALLET' : 'PRIVATE BALANCE'}
                  </Badge>
                </span>
                <span>
                  {mode === 'shield'
                    ? w.account
                      ? short(w.account)
                      : 'Wallet not connected'
                    : w.privacyAddress
                      ? short(w.privacyAddress)
                      : 'Authorize privacy address'}
                </span>
              </div>
              <div className="amount-line">
                <div className="token-picker">
                  <span className="coin">{selected?.symbol.includes('USD') ? '$' : '◈'}</span>
                  <select
                    aria-label="Select asset pool"
                    value={selected?.address ?? ''}
                    onChange={(e) => setPool(e.target.value)}
                    disabled={!pools.length || w.busy}
                  >
                    {pools.length ? (
                      pools.map((p) => (
                        <option value={p.address} key={p.address}>
                          {mode === 'shield' ? p.symbol.replace(/^s(?=[A-Z])/, '') : p.symbol}
                        </option>
                      ))
                    ) : (
                      <option value="">Select asset</option>
                    )}
                  </select>
                </div>
                <input
                  aria-label="Amount"
                  aria-invalid={!!form.formState.errors.amount}
                  aria-describedby={form.formState.errors.amount ? 'amount-error' : undefined}
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={w.busy}
                />
              </div>
              <div className="input-bottom">
                <span>{mode === 'shield' ? 'Public token' : 'Private asset'}</span>
                <span>
                  {availableLabel !== null
                    ? `Available ${availableLabel}`
                    : 'Authorize balance access in wallet details'}{' '}
                  <Wallet aria-hidden="true" size={12} />
                </span>
              </div>
            </div>
            {availableLabel !== null && (
              <div className="amount-percentages">
                {[25, 50, 75, 100].map((percent) => (
                  <button
                    type="button"
                    key={percent}
                    disabled={w.busy}
                    onClick={() => setPercentage(percent)}
                  >
                    {percent === 100 ? 'MAX' : `${percent}%`}
                  </button>
                ))}
              </div>
            )}
            <div className="flow-arrow">
              <ArrowDown aria-hidden="true" size={20} />
            </div>
            <div className="asset-output">
              <div className="input-caption">
                <span>
                  TO <Badge>{mode === 'unshield' ? 'PUBLIC WALLET' : 'PRIVATE BALANCE'}</Badge>
                </span>
                <LockKeyhole aria-hidden="true" size={13} />
              </div>
              <div className="amount-line">
                <div className="token-display">
                  <span className="coin green">
                    <Shield aria-hidden="true" size={22} />
                  </span>
                  <div>
                    <strong>{outputSymbol}</strong>
                    <small>{mode === 'unshield' ? 'Public withdrawal' : 'Private balance'}</small>
                  </div>
                </div>
                <div className="receive-amount">
                  {validAmount(amount) ? amount : '0.00'}
                  <small>Before wallet fees</small>
                </div>
              </div>
              {mode === 'send' ? (
                <label className="recipient-input">
                  <span>Recipient privacy address</span>
                  <input
                    aria-label="Recipient privacy address"
                    aria-invalid={!!form.formState.errors.recipient}
                    aria-describedby={
                      form.formState.errors.recipient ? 'recipient-error' : undefined
                    }
                    placeholder="perc1…"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    disabled={w.busy}
                  />
                </label>
              ) : (
                <div className="vault-address">
                  <LockKeyhole aria-hidden="true" size={13} />
                  <span>
                    {mode === 'unshield'
                      ? 'Withdraws to your connected public EVM address. Verify it in PLabs Wallet.'
                      : w.privacyAddress
                        ? short(w.privacyAddress)
                        : 'Privacy address stays inside your wallet.'}
                  </span>
                  {mode === 'shield' && w.privacyAddress && <CopyButton value={w.privacyAddress} />}
                </div>
              )}
            </div>
            <div className="fee-details">
              <div>
                <span>Protocol & network fees</span>
                <strong>Quoted in wallet</strong>
              </div>
            </div>
            {form.formState.errors.amount && (
              <p id="amount-error" className="error-message" role="alert">
                {form.formState.errors.amount.message}
              </p>
            )}
            {form.formState.errors.recipient && (
              <p id="recipient-error" className="error-message" role="alert">
                {form.formState.errors.recipient.message}
              </p>
            )}
            {precisionError && (
              <p role="alert" className="error-message">
                {precisionError}
              </p>
            )}
            {review && (
              <Notice>
                Review {amount} {selected?.symbol} on {network?.name}.{' '}
                {mode === 'send'
                  ? `Recipient: ${recipient}`
                  : 'Verify fees and destination in the extension before approving.'}
              </Notice>
            )}
            <Button
              type="button"
              className="primary-button transaction-cta"
              disabled={w.busy || (!!w.account && !canSubmit)}
              onClick={() => void submit()}
            >
              <Shield aria-hidden="true" size={19} />
              {w.busy
                ? 'Waiting for wallet approval…'
                : !w.account
                  ? 'Connect PLabs Wallet'
                  : review
                    ? 'Continue in PLabs Wallet'
                    : mode === 'shield'
                      ? 'Review deposit'
                      : mode === 'send'
                        ? 'Review private transfer'
                        : 'Review withdrawal'}
              <ArrowRight aria-hidden="true" size={17} />
            </Button>
            {w.account && !supportsAssetAction(w.capabilities, w.chainId, mode) && (
              <Notice>
                {assetModes[mode].label} is not supported by this wallet on{' '}
                {network?.name ?? 'the selected network'}. Choose another network or update your
                wallet.
              </Notice>
            )}
            <div className="form-footnote">
              <LockKeyhole aria-hidden="true" size={12} />
              Your keys never leave the PLabs Wallet extension.
            </div>
          </Panel>
        </div>
        <GatewayAside />
      </div>
      <Panel className="recent-panel">
        <div className="panel-heading">
          <h2>
            <HistoryIcon />
            Recent activity
          </h2>
          <Link className="text-link" to="/history?source=session">
            View all
            <ArrowRight aria-hidden="true" size={14} />
          </Link>
        </div>
        {w.activities.length ? (
          <div className="activity-preview">
            {w.activities.slice(0, 3).map((a) => (
              <div key={a.id}>
                <Badge>{activityLabels[a.kind]}</Badge>
                <strong>
                  {a.amount} {a.symbol}
                </strong>
                <span className="mono">{short(a.txHash || a.id)}</span>
                <Badge tone={a.state === 'confirmed' ? 'green' : 'amber'}>{a.state}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Your next private move starts here">
            {w.account
              ? 'Transactions initiated on this site appear here for this session.'
              : 'Connect your wallet to deposit, transfer privately or withdraw.'}
          </EmptyState>
        )}
      </Panel>
      <div className="security-note">
        <CheckCircle2 aria-hidden="true" size={15} />
        Your wallet holds your keys and confirms each transaction.
      </div>
    </div>
  );
}
function HistoryIcon() {
  return <ArrowLeftRight aria-hidden="true" size={17} />;
}
