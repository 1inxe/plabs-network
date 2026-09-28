import { ArrowUpRight, CircleAlert, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useWallet, WalletFeedback, WalletNotes } from '@/features/wallet';
import type { MarketConfig } from '@/services/market';
import { formatRaw, short } from '@/shared/lib/format';
import { Badge, EmptyState, Notice, Panel } from '@/shared/ui';
import { fundingStatusLabel, orderGroup, orderStatusLabel } from './order-status';
export function TradingAccount({ config }: { config: MarketConfig }) {
  const w = useWallet(),
    [tab, setTab] = useState('Open orders'),
    granted = w.privacyScopes.includes('dexOrders');
  const wrongNetwork = !!w.account && w.chainId !== config.chainId;
  useEffect(() => {
    if (!granted || wrongNetwork) return;
    void w.loadDexOrders();
    const timer = setInterval(
      () => {
        if (document.visibilityState === 'visible') void w.loadDexOrders();
      },
      w.busy ? 3000 : 30000,
    );
    return () => clearInterval(timer);
  }, [granted, wrongNetwork, w.busy, w.loadDexOrders]);
  const allOrders = w.dexOrders?.orders ?? [];
  const orders = allOrders.filter((order) => orderGroup(order) === tab);
  const pendingCount = allOrders.filter((order) => orderGroup(order) === 'Pending requests').length;
  return (
    <Panel className="orders-panel">
      <div className="order-tabs">
        {['Open orders', 'Pending requests', 'Order history', 'Private notes'].map((label) => (
          <button
            type="button"
            key={label}
            className={tab === label ? 'active' : ''}
            onClick={() => setTab(label)}
          >
            {label}
            {['Open orders', 'Pending requests'].includes(label) && (
              <Badge tone="gray">
                {w.dexOrders
                  ? allOrders.filter((order) => orderGroup(order) === label).length
                  : '—'}
              </Badge>
            )}
          </button>
        ))}
      </div>
      <WalletFeedback scope="dexOrders" />
      {wrongNetwork ? (
        <EmptyState
          title="PEX uses Monad"
          action={
            <button
              type="button"
              className="primary-button"
              disabled={w.busy}
              onClick={() => void w.switchChain(config.chainId)}
            >
              Switch wallet to Monad
            </button>
          }
        >
          Approve the network change in your wallet to view this market’s private account.
        </EmptyState>
      ) : tab === 'Private notes' ? (
        <WalletNotes />
      ) : !granted ? (
        <EmptyState
          title="Connect your private order history"
          action={
            <>
              {' '}
              <button
                type="button"
                className="primary-button"
                disabled={w.busy}
                onClick={() => void w.authorizeRead(['address', 'dexOrders'])}
              >
                Authorize order access
                <ArrowUpRight aria-hidden="true" size={14} />
              </button>
            </>
          }
        >
          Your wallet queries PLabs’ official Matcher using the order references you approve.
        </EmptyState>
      ) : (
        <div className="trading-account-body">
          <div className="wallet-section-heading">
            <span>
              {w.dexOrders
                ? `${tab === 'Pending requests' ? 'Pending wallet requests & status checks' : 'Wallet records & official Matcher'} · updated ${new Date(w.dexOrders.fetchedAt).toLocaleTimeString()}`
                : w.readError
                  ? 'Order status unavailable'
                  : 'Reading order status…'}
            </span>
            <div>
              <button
                type="button"
                className="secondary-button"
                disabled={w.busy}
                onClick={() => void w.importDexOrders()}
              >
                Import official order references
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Refresh private orders"
                onClick={() => void w.loadDexOrders()}
              >
                <RefreshCw aria-hidden="true" size={15} />
              </button>
            </div>
          </div>
          {tab === 'Open orders' && pendingCount > 0 && (
            <Notice>
              {pendingCount} wallet request(s) need confirmation or follow-up before appearing here.
              <button
                type="button"
                className="text-button"
                onClick={() => setTab('Pending requests')}
              >
                View pending requests
              </button>
            </Notice>
          )}
          {w.dexOrders?.needsImport && (
            <Notice>
              Open app.plabs.online with the same privacy account, then approve importing its order
              references in your wallet. Connecting an address alone cannot discover private orders.
            </Notice>
          )}

          {orders.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ORDER</th>
                    <th>SIDE</th>
                    <th>PRICE</th>
                    <th>QUANTITY</th>
                    <th>MATCHED</th>
                    <th>REMAINING</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={`${order.epoch}:${order.id}`}>
                      <td className="mono">{short(order.id)}</td>
                      <td>
                        <Badge tone={order.side === 'sell' ? 'red' : 'green'}>
                          {order.side.toUpperCase()}
                        </Badge>
                      </td>
                      <td>
                        {Number(order.priceTicks) / config.priceScale} {config.quoteSymbol}
                      </td>
                      <td>
                        {formatRaw(order.quantityRaw, config.baseDecimals)} {config.baseSymbol}
                      </td>
                      <td>{formatRaw(order.matchedRaw, config.baseDecimals)}</td>
                      <td>{formatRaw(order.remainingRaw, config.baseDecimals)}</td>
                      <td>
                        <Badge tone={order.status === 'open' ? 'green' : 'amber'}>
                          {orderStatusLabel(order)}
                        </Badge>
                        {tab === 'Pending requests' && order.fundingProgress && (
                          <ul className="order-funding-progress" aria-label="Funding progress">
                            {order.fundingProgress.map((leg, index) => (
                              // biome-ignore lint/suspicious/noArrayIndexKey: Journal funding legs are append-only and keep their original positions.
                              <li key={`${index}:${leg.asset}`}>
                                <span>{leg.asset}</span>
                                {fundingStatusLabel(leg.state)}
                              </li>
                            ))}
                          </ul>
                        )}
                        {order.executionActive && (
                          <p className="order-processing" role="status">
                            Processing in wallet…
                          </p>
                        )}
                        {order.error && (
                          <details className="order-issue-details">
                            <summary aria-label="View order issue">
                              <CircleAlert aria-hidden="true" size={14} />
                              Details
                            </summary>
                            <p>{order.error}</p>
                          </details>
                        )}
                      </td>
                      <td>
                        {order.managed && order.localId ? (
                          <div className="order-actions">
                            {order.canResume && (
                              <button
                                type="button"
                                className="text-button"
                                disabled={w.busy || order.executionActive}
                                onClick={() => void w.resumeDexOrder(order.localId ?? '')}
                              >
                                {order.executionState === 'open'
                                  ? 'Sync fills & assets'
                                  : 'Resume request'}
                              </button>
                            )}
                            {order.canCancel && (
                              <button
                                type="button"
                                className="text-button"
                                disabled={w.busy || order.executionActive}
                                onClick={() => void w.cancelDexOrder(order.localId ?? '')}
                              >
                                Cancel & recover
                              </button>
                            )}
                          </div>
                        ) : (
                          'Imported reference'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : w.dexOrders && !w.dexOrders.needsImport ? (
            <EmptyState
              title={
                tab === 'Open orders'
                  ? 'No open orders'
                  : tab === 'Pending requests'
                    ? 'No pending requests'
                    : 'No completed orders'
              }
            >
              {tab === 'Open orders'
                ? 'Only orders accepted by the official Matcher with remaining quantity or unsettled fills appear here.'
                : tab === 'Pending requests'
                  ? 'Requests awaiting funding, placement confirmation or recovery appear here. Resume uses the original request.'
                  : 'Filled orders and completed fund recoveries appear here.'}
            </EmptyState>
          ) : null}
          <Notice>
            Orders placed with this wallet keep recovery records in the extension. Cancel & recover
            returns unspent escrow after in-flight fills settle. Imported legacy references provide
            status only; recover those orders in the wallet that created them.
          </Notice>
        </div>
      )}
    </Panel>
  );
}
