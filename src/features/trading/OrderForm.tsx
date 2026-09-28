import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CircleAlert,
  LockKeyhole,
  RefreshCw,
  Settings2,
  Shield,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useWallet, WalletFeedback } from '@/features/wallet';
import type { MarketConfig, OrderBook } from '@/services/market';
import { formatRaw } from '@/shared/lib/format';
import { Notice, Panel, Segmented } from '@/shared/ui';
import type { OrderEstimate, OrderSide, OrderType } from './order-quote';
import { estimateOrder } from './order-quote';
import { orderStatusLabel } from './order-status';

export function OrderForm({
  config,
  book,
  bookError,
  onRefreshBook,
}: {
  config: MarketConfig;
  book?: OrderBook;
  bookError: boolean;
  onRefreshBook: () => void;
}) {
  const w = useWallet();
  const [side, setSide] = useState<OrderSide>('buy'),
    [type, setType] = useState<OrderType>('limit'),
    [amount, setAmount] = useState(''),
    [price, setPrice] = useState(''),
    [settings, setSettings] = useState(false),
    [slippage, setSlippage] = useState('0.5'),
    [reading, setReading] = useState(false);
  const connected = !!w.account,
    wrongNetwork = connected && w.chainId !== config.chainId,
    authorized = w.privacyScopes.includes('balances');
  const spendPool = side === 'sell' ? config.basePool : config.quotePool;
  const assets =
    w.portfolio && Number(w.portfolio.chainId) === config.chainId ? w.portfolio.private.assets : [];
  const balance = assets.find(
    (asset) => asset.poolAddress.toLowerCase() === spendPool?.toLowerCase(),
  );
  const feeBalance = assets.find(
    (asset) => asset.poolAddress.toLowerCase() === config.feePool?.toLowerCase(),
  );
  const refresh = async () => {
    setReading(true);
    try {
      await w.refreshPortfolio();
    } finally {
      setReading(false);
    }
  };
  useEffect(() => {
    if (!connected || wrongNetwork || !authorized) return;
    void w.refreshPortfolio();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void w.refreshPortfolio();
    }, 30000);
    return () => clearInterval(timer);
  }, [connected, wrongNetwork, authorized, w.refreshPortfolio]);
  let estimate: OrderEstimate | undefined,
    quoteError = '';
  if (amount && book && !bookError && (type === 'market' || price)) {
    try {
      estimate = estimateOrder({ config, book, side, type, amount, limitPrice: price, slippage });
    } catch (error) {
      quoteError = error instanceof Error ? error.message : 'Unable to estimate this order.';
    }
  }
  const sameFee = !!spendPool && spendPool.toLowerCase() === config.feePool?.toLowerCase();
  const required = estimate
    ? BigInt(estimate.principalRaw) + (sameFee ? BigInt(estimate.feeRaw) : 0n)
    : null;
  const balanceKnown = balance?.spendableRaw != null && balance.syncState === 'complete';
  const feeKnown = feeBalance?.spendableRaw != null && feeBalance.syncState === 'complete';
  const insufficient =
    required !== null && balanceKnown && BigInt(balance.spendableRaw ?? '0') < required;
  const insufficientFee =
    !!estimate &&
    feeKnown &&
    !sameFee &&
    BigInt(feeBalance?.spendableRaw ?? '0') < BigInt(estimate.feeRaw);
  const partial = !!estimate && estimate.remainderRaw !== '0';
  const feeSymbol =
    config.feePool?.toLowerCase() === config.basePool?.toLowerCase()
      ? config.baseSymbol
      : config.quoteSymbol;
  const feeDecimals = feeSymbol === config.baseSymbol ? config.baseDecimals : config.quoteDecimals;
  const needsSync = authorized && !wrongNetwork && !!w.portfolio && (!balanceKnown || !feeKnown);
  const best = side === 'sell' ? book?.bids[0] : book?.asks[0];
  let button = 'Update wallet for PEX trading',
    action: (() => void) | undefined;
  if (!connected) {
    button = 'Connect PLabs Wallet';
    action = () => w.setModal(true);
  } else if (wrongNetwork) {
    button = 'Switch wallet to Monad';
    action = () => void w.switchChain(config.chainId);
  } else if (!authorized) {
    button = 'Authorize balance access';
    action = () => void w.authorizeRead(['address', 'balances']);
  } else if (!w.portfolio || w.readError) {
    button = 'Refresh wallet balances';
    action = () => void refresh();
  } else if (needsSync) {
    button = 'Open wallet to sync assets';
    action = () => void w.open();
  } else if (w.capabilities?.methods.dexTrading) {
    button = side === 'sell' ? 'Review sell order' : 'Review buy order';
    if (
      estimate &&
      !quoteError &&
      !bookError &&
      !insufficient &&
      !insufficientFee &&
      !partial &&
      balanceKnown &&
      feeKnown
    ) {
      const intent = {
        chainId: '0x8f' as const,
        side,
        type,
        quantityRaw: estimate.quantityRaw,
        priceTicks: estimate.protectionTicks,
        maxFeeRaw: estimate.feeRaw,
      };
      action = () =>
        void w.placeDexOrder(intent).then((result) => {
          if (result) setAmount('');
        });
    }
  }
  function percentage(percent: number) {
    if (!balanceKnown || side !== 'sell') return;
    const available = BigInt(balance?.spendableRaw ?? '0'),
      fee = sameFee ? BigInt(config.feeUnits) : 0n;
    const principal = available > fee ? available - fee : 0n;
    const lot = BigInt(config.lotSize ?? '1');
    setAmount(
      formatRaw(
        (((principal * BigInt(percent)) / 100n / lot) * lot).toString(),
        config.baseDecimals,
      ),
    );
  }
  return (
    <Panel className="order-form">
      <div className="panel-heading">
        <h2>
          <Shield aria-hidden="true" size={19} />
          Spot order
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Order settings"
          onClick={() => setSettings(!settings)}
        >
          <Settings2 aria-hidden="true" size={17} />
        </button>
      </div>
      <p className="eyebrow small">PEX · PRIVATE BALANCE</p>
      {settings && (
        <label className="field">
          Slippage tolerance (%)
          <input
            aria-label="Slippage tolerance"
            inputMode="decimal"
            value={slippage}
            onChange={(event) => setSlippage(event.target.value)}
          />
        </label>
      )}
      <Segmented
        value={type}
        onChange={(value) => setType(value as OrderType)}
        items={[
          { value: 'market', label: 'Market' },
          { value: 'limit', label: 'Limit' },
        ]}
      />
      <div className="buy-sell">
        <button
          type="button"
          className={side === 'buy' ? 'buy active' : ''}
          onClick={() => setSide('buy')}
        >
          <ArrowDownLeft aria-hidden="true" size={17} />
          Buy {config.baseSymbol}
        </button>
        <button
          type="button"
          className={side === 'sell' ? 'sell active' : ''}
          onClick={() => setSide('sell')}
        >
          <ArrowUpRight aria-hidden="true" size={17} />
          Sell {config.baseSymbol}
        </button>
      </div>
      <div className="available-balance">
        <small>
          Available private balance
          {authorized ? (
            <button
              type="button"
              className="icon-button"
              aria-label="Refresh trading balances"
              disabled={reading}
              onClick={() => void refresh()}
            >
              <RefreshCw aria-hidden="true" size={12} />
            </button>
          ) : (
            <LockKeyhole aria-hidden="true" size={12} />
          )}
        </small>
        <strong>
          {authorized
            ? formatRaw(balance?.spendableRaw, balance?.decimals ?? config.baseDecimals)
            : '••••'}
          <span>{side === 'sell' ? config.baseSymbol : config.quoteSymbol}</span>
        </strong>
        {balance?.syncedAt && (
          <span className="trading-balance-time">
            Wallet scan: {new Date(balance.syncedAt).toLocaleString()}
          </span>
        )}
      </div>
      {type === 'limit' && (
        <label className="field">
          Limit price
          {best && (
            <button
              type="button"
              className="text-button best-price"
              onClick={() => setPrice(String(best.price))}
            >
              Use best {side === 'sell' ? 'bid' : 'ask'} · {best.price}
            </button>
          )}
          <div className="unit-input">
            <input
              aria-label="Limit price"
              inputMode="decimal"
              placeholder="0.00"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
            <span>{config.quoteSymbol}</span>
          </div>
        </label>
      )}
      <label className="field">
        Amount
        <div className="unit-input">
          <input
            aria-label="Order amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <span>{config.baseSymbol}</span>
        </div>
      </label>
      {side === 'sell' && balanceKnown && (
        <div className="amount-percentages">
          {[25, 50, 75, 100].map((percent) => (
            <button type="button" key={percent} onClick={() => percentage(percent)}>
              {percent === 100 ? 'MAX' : `${percent}%`}
            </button>
          ))}
        </div>
      )}
      <div className="fee-details">
        <div>
          <span>{side === 'sell' ? 'Estimated proceeds' : 'Estimated cost'}</span>
          <strong data-testid="order-estimate">
            {estimate ? formatRaw(estimate.quoteRaw, config.quoteDecimals) : '—'}{' '}
            {config.quoteSymbol}
          </strong>
        </div>
        <div>
          <span>Estimated fee reserve</span>
          <strong>
            {formatRaw(config.feeUnits, feeDecimals)} {feeSymbol}
          </strong>
        </div>
        {type === 'market' && (
          <>
            <div>
              <span>Slippage requested</span>
              <strong>{slippage}%</strong>
            </div>
            <div>
              <span>{side === 'sell' ? 'Protected price floor' : 'Protected price cap'}</span>
              <strong>
                {estimate ? formatRaw(estimate.protectionTicks, estimate.priceDecimals) : '—'}{' '}
                {config.quoteSymbol}
              </strong>
            </div>
          </>
        )}
      </div>
      <p className="order-estimate-caption">
        {type === 'market'
          ? 'Estimate follows current order-book depth. Price protection is rounded to the market tick.'
          : 'Limit orders may rest on the book until matching liquidity is available.'}{' '}
        The order fee is reserved separately.
      </p>
      {quoteError && (
        <p role="alert" className="error-message">
          {quoteError}
        </p>
      )}
      {bookError && (
        <Notice>
          Live order-book data is unavailable.{' '}
          <button type="button" className="text-button" onClick={onRefreshBook}>
            Refresh order book
          </button>
        </Notice>
      )}
      {partial && (
        <Notice>
          Only {formatRaw(estimate?.fillableRaw, config.baseDecimals)} {config.baseSymbol} can fill
          within the price protection. Reduce the amount or choose a limit order.
        </Notice>
      )}
      {insufficient && (
        <p role="alert" className="error-message">
          Insufficient {estimate?.spendSymbol}: this order needs{' '}
          {formatRaw(required?.toString(), balance?.decimals ?? 0)} including any same-asset fee.
        </p>
      )}
      {insufficientFee && (
        <p role="alert" className="error-message">
          This order also needs {formatRaw(estimate?.feeRaw, estimate?.feeDecimals ?? 0)}{' '}
          {estimate?.feeSymbol} as a separate fee reserve.
        </p>
      )}
      <div className="order-connection-status">
        <span>
          {connected ? (
            <Check aria-hidden="true" size={12} />
          ) : (
            <CircleAlert aria-hidden="true" size={12} />
          )}
          {connected ? 'Wallet connected' : 'Wallet not connected'}
        </span>
        <span>
          {authorized ? (
            <Check aria-hidden="true" size={12} />
          ) : (
            <LockKeyhole aria-hidden="true" size={12} />
          )}
          Balance access {authorized ? 'approved' : 'required'}
        </span>
      </div>
      <WalletFeedback scope="balances" />
      {!w.capabilities?.methods.dexTrading ? (
        <Notice>
          Update PLabs Wallet to version 0.7.0 or later, reload the extension, then refresh this
          page to enable PEX orders.
        </Notice>
      ) : (
        <p className="order-estimate-caption">
          Review the order in PLabs Wallet. Your wallet will request a second confirmation before
          locking the principal and fee.
        </p>
      )}
      {w.lastDexOrder && (
        <Notice>
          <strong>
            {w.lastDexOrder.executionState === 'open'
              ? 'Order submitted'
              : w.lastDexOrder.executionState === 'recovered'
                ? 'Funds recovered'
                : orderStatusLabel(w.lastDexOrder)}
          </strong>
          {w.lastDexOrder.error && (
            <details className="order-issue-details">
              <summary>View issue</summary>
              <p>{w.lastDexOrder.error}</p>
            </details>
          )}
          {w.lastDexOrder.executionState === 'funding' && (
            <p>
              This request has not reached the order book. Resume the original request from Pending
              requests.
            </p>
          )}
          <div className="order-actions">
            {w.lastDexOrder.localId && w.lastDexOrder.canResume && (
              <button
                type="button"
                className="text-button"
                disabled={w.busy}
                onClick={() => void w.resumeDexOrder(w.lastDexOrder?.localId ?? '')}
              >
                {w.lastDexOrder.executionState === 'open'
                  ? 'Sync fills & assets'
                  : 'Resume request'}
              </button>
            )}
            {w.lastDexOrder.localId && w.lastDexOrder.canCancel && (
              <button
                type="button"
                className="text-button"
                disabled={w.busy}
                onClick={() => void w.cancelDexOrder(w.lastDexOrder?.localId ?? '')}
              >
                Cancel & recover funds
              </button>
            )}
          </div>
        </Notice>
      )}
      <button
        type="button"
        className={`primary-button w-full ${side === 'sell' ? 'red-button' : ''}`}
        disabled={w.busy || reading || !action}
        onClick={action}
      >
        <LockKeyhole aria-hidden="true" size={15} />
        {w.busy ? 'Waiting for wallet…' : reading ? 'Reading balances…' : button}
      </button>
    </Panel>
  );
}
