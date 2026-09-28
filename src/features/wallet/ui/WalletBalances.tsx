import { ArrowUpRight, Globe2, LockKeyhole, RefreshCw, Shield } from 'lucide-react';
import { explorerUrl, formatRaw } from '@/shared/lib/format';
import { useWallet } from '../model/WalletProvider';

export function WalletBalances() {
  const w = useWallet(),
    portfolio = w.portfolio,
    authorized = w.privacyScopes.includes('balances');
  if (!authorized)
    return (
      <div className="wallet-disclosure">
        <LockKeyhole aria-hidden="true" size={20} />
        <h3>Show your balances</h3>
        <p>Approve wallet data access once for balances, activity, notes and orders.</p>
        <button
          type="button"
          className="primary-button"
          disabled={w.busy}
          onClick={() => void w.authorizeRead(['address', 'balances', 'history'])}
        >
          {w.readAuthorization === 'checking'
            ? 'Checking wallet…'
            : w.busy
              ? 'Waiting for wallet…'
              : 'Authorize balances & history'}
        </button>
      </div>
    );
  return (
    <div className="wallet-balances">
      <div className="wallet-section-heading">
        <span>
          {portfolio
            ? `Updated ${new Date(portfolio.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : w.readError
              ? 'Balances unavailable'
              : 'Reading your wallet…'}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="Refresh balances"
          onClick={() => void w.refreshPortfolio()}
        >
          <RefreshCw aria-hidden="true" size={14} />
        </button>
      </div>
      {!portfolio && !w.readError && (
        <div className="wallet-assets-loading" role="status" aria-label="Loading wallet assets">
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      )}
      <section className="wallet-assets-group shielded" aria-label="Private assets">
        <div className="wallet-assets-heading">
          <h3>
            <Shield aria-hidden="true" size={14} />
            Private assets
          </h3>
          <span>{portfolio?.private.error ? 'Unavailable' : 'Total balance'}</span>
        </div>

        {portfolio?.private.assets.map((asset) => (
          <div className="wallet-asset private-asset" key={asset.poolAddress}>
            <span className="coin green">
              {asset.symbol.includes('USD') ? '$' : asset.symbol.slice(0, 1)}
            </span>
            <div className="wallet-asset-description">
              <strong>{asset.symbol}</strong>
              <small>
                {asset.syncState !== 'complete' ? (
                  <span className="asset-sync-state" data-state={asset.syncState}>
                    {asset.syncState === 'unavailable'
                      ? 'Not synchronized'
                      : asset.syncState === 'error'
                        ? 'Sync error'
                        : 'Synchronizing'}
                  </span>
                ) : (
                  <>
                    Available <span>{formatRaw(asset.spendableRaw, asset.decimals)}</span>
                    {typeof asset.pendingRaw === 'string' && BigInt(asset.pendingRaw) > 0n && (
                      <>
                        {' '}
                        ·{' '}
                        <span className="asset-pending">
                          Pending {formatRaw(asset.pendingRaw, asset.decimals)}
                        </span>
                      </>
                    )}
                  </>
                )}
              </small>
            </div>
            <strong className="wallet-asset-value">
              {formatRaw(asset.totalRaw, asset.decimals)}
            </strong>
          </div>
        ))}
        {portfolio && !portfolio.private.error && !portfolio.private.assets.length && (
          <p className="wallet-assets-empty">No private assets configured on this network.</p>
        )}
      </section>
      <section className="wallet-assets-group" aria-label="Public assets">
        <div className="wallet-assets-heading">
          <h3>
            <Globe2 aria-hidden="true" size={14} />
            Public assets
          </h3>
          <span>{portfolio?.public.error ? 'Unavailable' : 'On-chain balance'}</span>
        </div>

        {portfolio?.public.assets.map((asset) => {
          const link = asset.address ? explorerUrl(w.chainId, asset.address) : null;
          return (
            <div className="wallet-asset" key={asset.address ?? 'native'}>
              <span className="coin">
                {asset.symbol.includes('USD') ? '$' : asset.symbol.slice(0, 1)}
              </span>
              <div className="wallet-asset-description">
                <strong>{asset.symbol}</strong>
                <small>
                  {asset.type === 'native' ? (
                    'Gas token'
                  ) : link ? (
                    <a href={link} target="_blank" rel="noreferrer">
                      Token contract
                      <ArrowUpRight aria-hidden="true" size={10} />
                    </a>
                  ) : (
                    'Public token'
                  )}
                </small>
              </div>
              <strong className="wallet-asset-value">
                {formatRaw(asset.balanceRaw, asset.decimals)}
              </strong>
            </div>
          );
        })}
        {portfolio && !portfolio.public.error && !portfolio.public.assets.length && (
          <p className="wallet-assets-empty">No public assets returned by your wallet.</p>
        )}
      </section>
      {portfolio?.private.assets.some((asset) => asset.syncState !== 'complete') && (
        <div className="wallet-sync-hint">
          <span>Some private balances need a wallet sync.</span>
          <button
            type="button"
            className="text-button"
            disabled={w.openingWallet}
            onClick={() => void w.open()}
          >
            Open wallet
            <ArrowUpRight aria-hidden="true" size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
