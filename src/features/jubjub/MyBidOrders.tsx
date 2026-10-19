import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { useId, useState } from 'react';
import { formatP20, type JubjubBidIntent, type JubjubMe } from '@/services/platform/jubjub';
import { explorerUrl, short } from '@/shared/lib/format';
import { Badge, CopyButton, Panel } from '@/shared/ui';
import { describeBidOrder, newestBidOrders } from './bid-orders';

const pageSize = 5;
const dateLabel = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

export function MyBidOrders({
  me,
  signedIn,
  loading,
  error = false,
  busy,
  onSignIn,
  onRefresh,
  onResume,
}: {
  me?: JubjubMe;
  signedIn: boolean;
  loading: boolean;
  error?: boolean;
  busy: boolean;
  onSignIn: () => void;
  onRefresh: () => void;
  onResume: (intent: JubjubBidIntent) => void;
}) {
  const headingId = useId();
  const listId = useId();
  const [limit, setLimit] = useState(pageSize);
  const orders = signedIn && me ? newestBidOrders(me.intents) : [];
  const disabled = busy || loading;
  return (
    <Panel className="jubjub-orders">
      <section id="my-bid-orders" aria-labelledby={headingId} aria-busy={loading}>
        <div className="panel-heading jubjub-orders-heading">
          <div>
            <span className="eyebrow">YOUR AUCTION ACTIVITY</span>
            <h2 id={headingId}>My bid orders</h2>
          </div>
          {signedIn && (
            <button
              type="button"
              className="text-button"
              disabled={disabled}
              onClick={onRefresh}
              aria-label="Refresh my bid orders"
            >
              <RefreshCw aria-hidden="true" size={14} />
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          )}
        </div>
        {!signedIn ? (
          <div className="jubjub-orders-state">
            <p>Sign in with your privacy wallet to view your bids and payment status.</p>
            <button type="button" className="secondary-button" disabled={busy} onClick={onSignIn}>
              {busy ? 'Connecting…' : 'Sign in to view bids'}
            </button>
          </div>
        ) : (
          <>
            {error && (
              <div className="jubjub-orders-state" role="alert">
                <p>
                  {me
                    ? 'Could not refresh your bids. Showing the last loaded records.'
                    : 'Your bid records could not be loaded. Refresh to try again.'}
                </p>
              </div>
            )}
            {!me && !error && (
              <div className="jubjub-orders-state" role="status">
                {loading ? 'Loading your bid orders…' : 'Your bid records are not available yet.'}
              </div>
            )}
            {me && !orders.length && !error && (
              <div className="jubjub-orders-state">
                <p>No bids yet. Your first bid and later increases will appear here.</p>
              </div>
            )}
            {!!orders.length && (
              <>
                <ol id={listId} className="jubjub-orders-list" aria-label="Your bid orders">
                  {orders.slice(0, limit).map((intent) => {
                    const status = describeBidOrder(intent, me?.jobs ?? []);
                    return (
                      <li key={intent.id} className="jubjub-order" data-intent-id={intent.id}>
                        <div className="jubjub-order-heading">
                          <time
                            dateTime={new Date(intent.createdAt * 1000).toISOString()}
                            title={new Date(intent.createdAt * 1000).toLocaleString()}
                          >
                            {dateLabel(intent.createdAt)}
                          </time>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </div>
                        <div className="jubjub-order-id">
                          <span>Bid ID</span>
                          <code title={intent.id}>{short(intent.id)}</code>
                          <CopyButton value={intent.id} label="Copy bid order ID" />
                        </div>
                        <dl className="jubjub-order-amounts">
                          <div>
                            <dt>Total bid</dt>
                            <dd>{formatP20(intent.total)} P20</dd>
                          </div>
                          <div>
                            <dt>Additional payment</dt>
                            <dd>+{formatP20(intent.delta)} P20</dd>
                          </div>
                        </dl>
                        <div className="jubjub-order-status">
                          <p>{status.detail}</p>
                          {status.jobs.map((job) => (
                            <small key={job.id}>Sponsor: {job.status}</small>
                          ))}
                        </div>
                        {status.errors.map((message) => (
                          <p key={message} className="jubjub-order-error">
                            {message}
                          </p>
                        ))}
                        <div className="jubjub-order-footer">
                          <div className="jubjub-order-transactions">
                            {status.txHashes.map((txHash) => (
                              <a
                                key={txHash}
                                href={explorerUrl(143, txHash) ?? undefined}
                                className="text-link"
                                target="_blank"
                                rel="noreferrer"
                                title={txHash}
                                aria-label={`View transaction ${txHash} on Monadscan`}
                              >
                                <span className="mono">{short(txHash)}</span>
                                <ArrowUpRight aria-hidden="true" size={13} />
                              </a>
                            ))}
                          </div>
                          {status.canResume && (
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={disabled || error}
                              onClick={() => onResume(intent)}
                              aria-label={`Resume bid ${short(intent.id)} for ${formatP20(intent.total)} P20 total`}
                            >
                              Resume bid
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
                <div className="jubjub-orders-pagination">
                  <span>
                    Showing {Math.min(limit, orders.length)} of {orders.length} bids
                  </span>
                  {orders.length > limit && (
                    <button
                      type="button"
                      className="text-button"
                      aria-controls={listId}
                      onClick={() => setLimit((current) => current + pageSize)}
                    >
                      Show {Math.min(pageSize, orders.length - limit)} more
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </section>
    </Panel>
  );
}
