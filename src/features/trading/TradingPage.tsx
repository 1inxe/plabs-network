import { useQuery } from '@tanstack/react-query';
import { ChartCandlestick, ChevronDown, RefreshCw, Shield } from 'lucide-react';
import { useState } from 'react';
import type { Interval, MarketConfig, OrderLevel } from '@/services/market';
import { marketQueries } from '@/services/market';
import { compact } from '@/shared/lib/format';
import { Badge, EmptyState, Notice, Panel, Segmented } from '@/shared/ui';
import { ServiceStatus } from '@/shared/ui/ServiceStatus';
import { MarketChart } from './MarketChart';
import { OrderForm } from './OrderForm';
import { TradingAccount } from './TradingAccount';
export function Pex() {
  const config = useQuery(marketQueries.config());
  if (!config.data)
    return (
      <div className="page">
        <EmptyState
          title={config.isError ? 'Market temporarily unavailable' : 'Loading the market…'}
          action={
            config.isError ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => void config.refetch()}
              >
                Retry market connection
              </button>
            ) : undefined
          }
        >
          Connecting to the PLabs matching engine.
        </EmptyState>
      </div>
    );
  return (
    <>
      <div className="market-config-state">
        {config.isError && (
          <Notice>
            Market configuration could not refresh. Last available configuration is shown.
          </Notice>
        )}
      </div>
      <TradingWorkspace config={config.data} />
    </>
  );
}
function TradingWorkspace({ config }: { config: MarketConfig }) {
  const [interval, setInterval] = useState<Interval>('15m'),
    [view, setView] = useState('price');
  const stats = useQuery(marketQueries.stats()),
    book = useQuery(marketQueries.book(config)),
    candles = useQuery(marketQueries.candles(interval, config));
  const last = stats.data?.price ?? Number.NaN;
  const levels = (rows: OrderLevel[], sell: boolean) =>
    rows.map((r) => (
      <div className={`book-row ${sell ? 'ask' : 'bid'}`} key={r.price}>
        <div
          className="depth-bar"
          style={{
            width: `${Math.max(5, Math.min(100, (r.size / Math.max(1, ...rows.map((r) => r.size))) * 100))}%`,
          }}
        />
        <span>{r.price.toFixed(5)}</span>
        <span>{compact(r.size)}</span>
        <span>{compact(r.total)}</span>
      </div>
    ));
  return (
    <div className="page pex-page">
      <div className="market-header">
        <div className="market-pair">
          <span className="coin green">
            <ChartCandlestick aria-hidden="true" size={22} />
          </span>
          <div>
            <h1>
              P20 <span>/ sUSDC</span>
            </h1>
            <Badge tone="cyan">MONAD</Badge>
          </div>
          <ChevronDown aria-hidden="true" size={15} />
        </div>
        <div className="market-price">
          <strong>{Number.isFinite(last) ? last.toFixed(5) : '—'}</strong>
          <span>sUSDC</span>
          <Badge tone={(stats.data?.change ?? 0) < 0 ? 'red' : 'green'}>
            {stats.data?.change != null ? `${stats.data.change.toFixed(2)}%` : '—'}
          </Badge>
        </div>
        <div className="market-stat">
          <small>24h Volume</small>
          <strong>
            {stats.data ? compact(Number(stats.data.volume)) : '—'} <span>P20</span>
          </strong>
        </div>
        <div className="market-stat">
          <small>Spot FDV</small>
          <strong className="text-amber">
            {stats.data?.fdv != null ? `$${compact(stats.data.fdv)}` : '—'}
          </strong>
        </div>
        <div className="market-live">
          <span className={`status-dot ${stats.isError ? 'muted' : ''}`} />
          {stats.isError
            ? 'Feed unavailable'
            : stats.isPending
              ? 'Loading market'
              : 'Public market feed'}
          <button
            type="button"
            className="icon-button"
            aria-label="Refresh market"
            onClick={() => {
              void stats.refetch();
              void book.refetch();
              void candles.refetch();
            }}
          >
            <RefreshCw aria-hidden="true" size={14} />
          </button>
        </div>
      </div>
      <div className="trading-grid">
        <Panel className="chart-panel">
          <div className="chart-toolbar">
            <Segmented
              value={view}
              onChange={setView}
              items={[
                { value: 'price', label: 'Price Candlestick' },
                { value: 'fdv', label: 'FDV' },
              ]}
            />
            <div className="timeframes">
              {(['1m', '5m', '15m', '1h', '4h', '1d'] as const).map((t) => (
                <button
                  type="button"
                  className={interval === t ? 'active' : ''}
                  key={t}
                  onClick={() => setInterval(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="chart-meta">
            <span>P20 / sUSDC</span>
            <span className="text-green">
              {Number.isFinite(last)
                ? `24H VWAP ${last.toFixed(5)}`
                : stats.data
                  ? 'No trades in 24h'
                  : '24H VWAP —'}
            </span>
            <span>VOLUME</span>
            <span>{stats.data ? compact(Number(stats.data.volume)) : '—'}</span>
          </div>
          {candles.data?.length ? (
            <MarketChart candles={candles.data} view={view} supply={stats.data?.supply ?? 0} />
          ) : (
            <div className="chart-empty">
              <EmptyState
                title={
                  candles.isError
                    ? 'Market feed unavailable'
                    : candles.isPending
                      ? 'Loading market data…'
                      : 'No trades in this interval'
                }
                action={
                  candles.isError ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void candles.refetch()}
                    >
                      Retry
                    </button>
                  ) : undefined
                }
              >
                Candles display recorded trades only.
              </EmptyState>
            </div>
          )}
          <div className="chart-bottom">
            <Shield aria-hidden="true" size={14} />
            <ServiceStatus
              error={candles.isError}
              fetching={candles.isFetching}
              updatedAt={candles.dataUpdatedAt}
            />
            <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
              Charts by TradingView ↗
            </a>
          </div>
        </Panel>
        <Panel className="order-book">
          {book.isError && book.data && <Notice>Showing the last available order book.</Notice>}
          <div className="panel-heading">
            <h2>Order Book</h2>
            <span className="mono">P20</span>
          </div>
          <div className="book-labels">
            <span>Price</span>
            <span>Size</span>
            <span>Total</span>
          </div>
          {book.data ? (
            <>
              {levels([...book.data.asks.slice(0, 8)].reverse(), true)}
              <div className="book-mid">
                <strong>{Number.isFinite(last) ? last.toFixed(5) : '—'}</strong>
                <small>24h VWAP</small>
              </div>
              {levels(book.data.bids.slice(0, 8), false)}
              <div className="book-balance">
                <span>Bids {compact(book.data.bids.reduce((s, r) => s + r.size, 0))}</span>
                <span>Asks {compact(book.data.asks.reduce((s, r) => s + r.size, 0))}</span>
              </div>
            </>
          ) : (
            <EmptyState
              title={book.isError ? 'Book unavailable' : 'Loading order book…'}
              action={
                book.isError ? (
                  <button type="button" className="text-button" onClick={() => void book.refetch()}>
                    Retry
                  </button>
                ) : undefined
              }
            />
          )}
        </Panel>
        <OrderForm
          config={config}
          book={book.data}
          bookError={book.isError}
          onRefreshBook={() => void book.refetch()}
        />
      </div>
      <TradingAccount config={config} />
    </div>
  );
}
