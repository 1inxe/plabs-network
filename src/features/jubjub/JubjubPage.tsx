import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpRight, Clock3, Fingerprint, RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '@/features/wallet';
import {
  createJubjubService,
  formatP20,
  type JubjubAuthSession,
  parseP20,
  validateBid,
} from '@/services/platform/jubjub';
import { errorMessage } from '@/shared/api/errors';
import { apiEndpoints } from '@/shared/config/env';
import { short } from '@/shared/lib/format';
import { Badge, Modal, Notice, Panel } from '@/shared/ui';
import { AuctionAnalytics } from './AuctionAnalytics';
import { BidChart } from './BidChart';
import { describeBidOrder } from './bid-orders';
import { MyBidOrders } from './MyBidOrders';

const service = createJubjubService(apiEndpoints.jubjub);
const dateLabel = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
function countdown(seconds: number) {
  const remaining = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(remaining / 3600)).padStart(2, '0')}:${String(Math.floor(remaining / 60) % 60).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
}
const intentId = () =>
  `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) => value.toString(16).padStart(2, '0')).join('')}`;
function supportedBid(total: bigint, previous = 0n) {
  const bid = validateBid(total, previous);
  if (total > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('This bid exceeds the amount supported by the wallet. Choose a smaller total.');
  return bid;
}

export function JubjubPage() {
  const wallet = useWallet();
  return (
    <Auction
      key={`${wallet.account}:${wallet.chainId}:${wallet.privacyAddress}:${wallet.privacyExpiresAt}:${wallet.privacyScopes.join(',')}`}
      wallet={wallet}
    />
  );
}

function Auction({ wallet }: { wallet: ReturnType<typeof useWallet> }) {
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: ['jubjub', 'config'],
    queryFn: ({ signal }) => service.config(signal),
    refetchInterval: 30000,
    retry: 1,
  });
  const summary = useQuery({
    queryKey: ['jubjub', 'summary'],
    queryFn: ({ signal }) => service.summary(signal),
    refetchInterval: 5000,
    retry: 1,
  });
  const history = useQuery({
    queryKey: ['jubjub', 'history'],
    queryFn: ({ signal }) => service.history(signal),
    refetchInterval: 15000,
    retry: 1,
  });
  const [session, setSession] = useState<JubjubAuthSession | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [review, setReview] = useState<{ total: string; delta: string; resumeId?: string } | null>(
    null,
  );
  const [refundMessage, setRefundMessage] = useState('');
  const [walletPending, setWalletPending] = useState<{
    id: string;
    total: string;
    delta: string;
  } | null>(null);
  const [supported, setSupported] = useState(wallet.capabilities?.methods.jubjubBidding === true);
  const [now, setNow] = useState(Date.now());
  const operation = useRef<AbortController | null>(null);
  const me = useQuery({
    queryKey: ['jubjub', 'me', wallet.account, wallet.privacyAddress, session?.expires],
    queryFn: ({ signal }) => service.me(session?.token ?? '', signal),
    enabled: !!session && session.expires * 1000 > now,
    refetchInterval: 5000,
    retry: false,
    gcTime: 0,
  });
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(timer);
      operation.current?.abort();
    };
  }, []);
  useEffect(() => {
    const changedCampaign =
      session &&
      profile.data &&
      (session.campaignId !== profile.data.rules.id ||
        session.rulesHash !== profile.data.rulesHash);
    if (
      session &&
      (session.expires * 1000 <= now ||
        (profile.data &&
          (session.campaignId !== profile.data.rules.id ||
            session.rulesHash !== profile.data.rulesHash)))
    ) {
      operation.current?.abort();
      operation.current = null;
      setBusy(false);
      setReview(null);
      if (changedCampaign) {
        setWalletPending(null);
        setRefundMessage('');
      }
      setSession(null);
      setMessage(
        'Your campaign session expired or the campaign changed. Sign in again to continue.',
      );
    }
  }, [now, session, profile.data]);

  const config = profile.data;
  const stats = summary.data;
  const clock = stats ? stats.serverTime + Math.max(0, now - summary.dataUpdatedAt) / 1000 : 0;
  const scheduled = !!config && clock < config.rules.startsAt;
  const ended =
    !!config &&
    !!stats &&
    (clock >= config.rules.endsAt || stats.phase === 'ended' || stats.phase === 'settled');
  const dataReady =
    !!config &&
    !!stats &&
    !profile.isError &&
    !summary.isError &&
    !stats.unavailable &&
    stats.campaignId === config.rules.id &&
    stats.rulesHash === config.rulesHash &&
    now - summary.dataUpdatedAt < 20000;
  const active =
    dataReady &&
    config.rules.enabled &&
    stats.phase === 'bidding' &&
    !stats.bidPaused &&
    !stats.unavailable &&
    !scheduled &&
    !ended;
  const accountData =
    session &&
    !me.isError &&
    me.data?.summary.campaignId === config?.rules.id &&
    me.data?.summary.rulesHash === config?.rulesHash
      ? me.data
      : undefined;
  const confirmed = accountData?.intents
    .filter((intent) => intent.status === 'funded')
    .sort((a, b) => b.version - a.version)[0];
  const prepared =
    accountData?.intents.find(
      (intent) =>
        intent.status === 'prepared' && describeBidOrder(intent, accountData.jobs).canResume,
    ) ?? walletPending;
  const blockedBid =
    !prepared && accountData?.intents.find((intent) => intent.status === 'prepared');
  const qualification = accountData?.qualification;
  const phase = !dataReady
    ? 'Connecting'
    : ended
      ? 'Ended'
      : scheduled
        ? 'Scheduled'
        : stats.bidPaused || !config.rules.enabled
          ? 'Paused'
          : 'Live auction';
  const amountIssue = (() => {
    if (!amount) return '';
    try {
      supportedBid(parseP20(amount), BigInt(confirmed?.total ?? '0'));
      return '';
    } catch (cause) {
      return errorMessage(cause);
    }
  })();

  async function run(task: (signal: AbortSignal) => Promise<void>) {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError('');
    try {
      await task(controller.signal);
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorMessage(cause));
    } finally {
      if (!controller.signal.aborted) {
        operation.current = null;
        setBusy(false);
      }
    }
  }
  async function current(signal: AbortSignal) {
    signal.throwIfAborted();
    if (!wallet.wallet) throw new Error('Connect PLabs Wallet to continue.');
    const context = await wallet.wallet.session();
    signal.throwIfAborted();
    if (
      context.accounts[0]?.toLowerCase() !== wallet.account.toLowerCase() ||
      context.chainId !== 143 ||
      context.privacy?.address !== wallet.privacyAddress ||
      !context.privacy.scopes.includes('address') ||
      (session && session.expires * 1000 <= Date.now())
    )
      throw new Error('Your wallet context changed. Sign in again.');
    return context;
  }
  function signIn() {
    void run(async (signal) => {
      if (!wallet.wallet) return;
      setMessage('Approve the campaign sign-in and privacy ownership proof in your wallet.');
      const result = await service.authenticate({
        wallet: wallet.wallet,
        account: wallet.account,
        chainId: wallet.chainId,
        signal,
      });
      const context = await current(signal);
      setSupported(context.capabilities.methods.jubjubBidding === true);
      setSession(result);
      setMessage('Signed in. Your current bid and settlement status are available below.');
    });
  }
  function openReview() {
    setError('');
    try {
      if (!session || !accountData) throw new Error('Sign in and wait for your bid status first.');
      if (blockedBid)
        throw new Error(
          'An earlier payment needs attention. Check My bid orders and refresh its status before making another bid.',
        );
      if (!active && !prepared) throw new Error('Bidding is not currently available.');
      if (prepared)
        setReview({ total: prepared.total, delta: prepared.delta, resumeId: prepared.id });
      else {
        const valid = supportedBid(parseP20(amount), BigInt(confirmed?.total ?? '0'));
        setReview({ total: valid.totalUnits, delta: valid.deltaUnits });
      }
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  function fund() {
    if (!review || !session) return;
    const approved = review;
    setReview(null);
    void run(async (signal) => {
      const context = await current(signal);
      if (!context.capabilities.methods.jubjubBidding || !wallet.wallet?.fundJubjubBid) {
        setSupported(false);
        throw new Error(
          'Reload the updated PLabs Wallet extension and reconnect to enable JubJub bidding.',
        );
      }
      setMessage('Checking your latest bid before requesting wallet approval…');
      const fresh = await service.me(session.token, signal);
      await current(signal);
      let intent = approved.resumeId
        ? fresh.intents.find(
            (item) => item.id === approved.resumeId && ['prepared', 'funded'].includes(item.status),
          )
        : fresh.intents.find(
            (item) => item.status === 'prepared' && describeBidOrder(item, fresh.jobs).canResume,
          );
      if (approved.resumeId && !intent)
        throw new Error('The saved bid changed. Refresh your bid status before continuing.');
      if (
        intent &&
        (intent.total !== approved.total ||
          intent.delta !== approved.delta ||
          (approved.resumeId && intent.id !== approved.resumeId))
      )
        throw new Error('There is a different pending bid. Refresh and review that bid first.');
      if (!intent) {
        if (fresh.intents.some((item) => item.status === 'prepared'))
          throw new Error(
            'An earlier payment needs attention. Check My bid orders before making another bid.',
          );
        const status = await service.summary(signal);
        if (
          !config ||
          status.campaignId !== config.rules.id ||
          status.rulesHash !== config.rulesHash ||
          status.phase !== 'bidding' ||
          status.bidPaused ||
          status.unavailable ||
          status.serverTime < config.rules.startsAt ||
          status.serverTime >= config.rules.endsAt
        )
          throw new Error('The campaign is no longer accepting new bids.');
        const latest = fresh.intents
          .filter((item) => item.status === 'funded')
          .sort((a, b) => b.version - a.version)[0];
        const valid = supportedBid(BigInt(approved.total), BigInt(latest?.total ?? '0'));
        if (valid.deltaUnits !== approved.delta)
          throw new Error('Your bid changed. Review the new additional payment first.');
        await current(signal);
        intent = await service.prepareBid(
          session.token,
          {
            id: intentId(),
            total: approved.total,
            version: fresh.position?.version ?? 0,
          },
          signal,
        );
      }
      await current(signal);
      if (intent.total !== approved.total || intent.delta !== approved.delta)
        throw new Error('The prepared payment differs from your review. Refresh your bid status.');
      setWalletPending({ id: intent.id, total: intent.total, delta: intent.delta });
      setMessage(
        `Approve ${formatP20(intent.delta)} P20 in your wallet. Proof generation may take a few minutes.`,
      );
      const result = await wallet.wallet.fundJubjubBid({
        intentId: intent.id,
        token: session.token,
      });
      await current(signal);
      if (result.intentId !== intent.id)
        throw new Error('The wallet returned a different bid. Refresh before continuing.');
      if (result.state === 'failed') {
        setWalletPending(null);
        throw new Error(
          result.message ||
            'The bid could not be completed. Resume the saved bid to check its status.',
        );
      }
      if (result.state === 'confirmed') setWalletPending(null);
      setMessage(
        result.state === 'confirmed'
          ? `Bid confirmed: ${formatP20(intent.total)} P20 total.`
          : result.message ||
              'Your bid is pending. Resume the saved bid to check confirmation; the original payment is preserved.',
      );
      setAmount('');
      await me.refetch();
      await queryClient.invalidateQueries({ queryKey: ['jubjub', 'summary'] });
    });
  }
  function refund() {
    if (!session) return;
    void run(async (signal) => {
      await current(signal);
      const result = await service.refund(session.token, signal);
      await current(signal);
      setRefundMessage(
        !result.refundsReleased
          ? 'Funds remain at the official receiving address. Refund timing is pending.'
          : !result.settled
            ? 'Settlement is being confirmed.'
            : BigInt(result.refundableUnits) > 0n
              ? `${formatP20(result.refundableUnits)} P20 queued for return to your privacy wallet. Gas is sponsored.`
              : BigInt(result.refundedUnits) > 0n
                ? `${formatP20(result.refundedUnits)} P20 returned to your privacy wallet.`
                : `${formatP20(result.chargedUnits)} P20 paid as your final winning bid.`,
      );
      await me.refetch();
    });
  }
  const refresh = () => {
    void profile.refetch();
    void summary.refetch();
    void history.refetch();
    if (session) void me.refetch();
  };
  return (
    <div className="page jubjub-page">
      <div className="jubjub-breadcrumb">
        <Link to="/p-sea">
          <ArrowLeft size={14} /> NFT gallery
        </Link>
        <a href="https://app.plabs.online/privasea/jubjub" target="_blank" rel="noreferrer">
          Official auction <ArrowUpRight size={14} />
        </a>
      </div>
      <div className="jubjub-heading">
        <div>
          <div className="eyebrow">PRIVASEA / GENESIS AUCTION</div>
          <h1>
            A private bid.
            <br />
            <span>A place in JubJub.</span>
          </h1>
          <p>
            Bid with P20 from your privacy wallet. Follow the auction and manage your place in the
            collection.
          </p>
        </div>
        <img src="/assets/jubjub-bird-icon.png" width="128" height="128" alt="JubJub Bird" />
      </div>
      <div className="jubjub-status-strip">
        <Badge tone={active ? 'green' : 'amber'}>{phase}</Badge>
        <span>Monad mainnet</span>
        <span>P20 · Private payment</span>
        <span className="jubjub-sponsor">
          <ShieldCheck size={14} /> Gas sponsored
        </span>
        <button
          type="button"
          className="text-button"
          aria-label="Refresh auction"
          onClick={refresh}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>
      {(profile.isError || summary.isError || (config && stats && !dataReady)) && (
        <div role="alert" className="jubjub-error">
          The live campaign could not be verified. Bidding is paused here until the latest status is
          available.{' '}
          <button type="button" className="text-button" onClick={refresh}>
            Retry
          </button>
        </div>
      )}
      <div className="jubjub-metrics">
        <Metric
          label="AUCTION SEATS"
          value={config?.rules.auctionSeats.toLocaleString() ?? '—'}
          detail="One position per privacy identity"
        />
        <Metric
          label="TOTAL COMMITTED"
          value={stats ? `${formatP20(stats.committedUnits)} P20` : '—'}
          detail={
            stats ? `${stats.positions.toLocaleString()} funded positions` : 'Loading live totals'
          }
        />
        <Metric
          label="BIDS PLACED"
          value={stats?.bidTransactions.toLocaleString() ?? '—'}
          detail={
            stats?.bidAttempts !== undefined
              ? `${stats.bidAttempts.toLocaleString()} bid requests`
              : 'Confirmed bid transactions'
          }
        />
        <Metric
          label={scheduled ? 'STARTS IN' : 'TIME REMAINING'}
          value={
            config && stats
              ? countdown((scheduled ? config.rules.startsAt : config.rules.endsAt) - clock)
              : '—'
          }
          detail={
            config
              ? `${ended ? 'Ended' : 'Ends'} ${dateLabel(config.rules.endsAt)}`
              : 'Loading campaign schedule'
          }
        />
      </div>
      <div className="jubjub-workspace">
        <div className="jubjub-market-column">
          <Panel className="jubjub-chart-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">THE AUCTION, IN VIEW</span>
                <h2>Bid trend</h2>
              </div>
              <span className="mono muted">P20 · live totals every 5s</span>
            </div>
            {history.isError ? (
              <div className="jubjub-chart-empty" role="status">
                Bid history is unavailable.{' '}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void history.refetch()}
                >
                  Retry chart
                </button>
              </div>
            ) : (
              <BidChart
                history={history.data?.rulesHash === config?.rulesHash ? history.data : undefined}
                confirmedBid={confirmed?.total}
                seats={config?.rules.auctionSeats}
              />
            )}
          </Panel>
          <AuctionAnalytics
            config={config}
            summary={
              config &&
              stats?.campaignId === config.rules.id &&
              stats.rulesHash === config.rulesHash &&
              !stats.unavailable
                ? stats
                : undefined
            }
            history={
              config &&
              history.data?.campaignId === config.rules.id &&
              history.data.rulesHash === config.rulesHash
                ? history.data
                : undefined
            }
            now={stats?.serverTime ?? 0}
            live={dataReady}
            historyError={history.isError}
          />
          <MyBidOrders
            me={accountData}
            signedIn={!!session}
            loading={!!session && me.isPending}
            error={!!session && (me.isError || (!me.isPending && !accountData))}
            busy={busy || wallet.busy}
            onSignIn={() => {
              if (!wallet.account) wallet.setModal(true);
              else if (wallet.chainId !== 143) void wallet.switchChain(143);
              else if (!wallet.privacyAddress) void wallet.authorizeRead(['address']);
              else signIn();
            }}
            onRefresh={() => {
              if (session) void me.refetch();
            }}
            onResume={(intent) => {
              if (!session || !accountData || busy) return;
              setReview({ total: intent.total, delta: intent.delta, resumeId: intent.id });
            }}
          />
        </div>
        <Panel className="jubjub-bid-panel">
          <div className="panel-heading">
            <h2>{prepared ? 'Resume your bid' : 'Your bid'}</h2>
            <Badge tone="gray">P20</Badge>
          </div>
          {confirmed && (
            <div className="jubjub-confirmed">
              <span>Confirmed total</span>
              <strong>
                {formatP20(confirmed.total)} <small>P20</small>
              </strong>
            </div>
          )}
          {!wallet.account ? (
            <Notice>Connect PLabs Wallet to view your position and place a bid.</Notice>
          ) : wallet.chainId !== 143 ? (
            <Notice>This auction uses P20 on Monad mainnet.</Notice>
          ) : !wallet.privacyAddress ? (
            <Notice>Unlock your privacy wallet to prove ownership and view your bid.</Notice>
          ) : !session ? (
            <Notice>
              Sign in to this campaign to load your existing bid before making a payment.
            </Notice>
          ) : null}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              openReview();
            }}
          >
            <label className="jubjub-amount-label" htmlFor="jubjub-amount">
              {prepared ? 'Saved total bid' : 'Total bid amount'}
            </label>
            <div className={`jubjub-amount ${amountIssue ? 'invalid' : ''}`}>
              <input
                id="jubjub-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="100"
                aria-describedby="jubjub-amount-help"
                aria-invalid={!!amountIssue}
                value={prepared ? formatP20(prepared.total).replaceAll(',', '') : amount}
                disabled={busy || !!prepared || ended}
                onChange={(event) => {
                  if (/^\d{0,14}(\.\d{0,6})?$/.test(event.target.value))
                    setAmount(event.target.value);
                }}
              />
              <span>P20</span>
            </div>
            <div className="jubjub-presets">
              {[100, 250, 500].map((value) => (
                <button
                  type="button"
                  key={value}
                  disabled={busy || !!prepared || ended}
                  onClick={() => setAmount(String(value))}
                >
                  {value}
                </button>
              ))}
              <button
                type="button"
                disabled={busy || !!prepared || ended}
                onClick={() => {
                  const next = BigInt(confirmed?.total ?? '0') + 50000000n;
                  setAmount(String((next < 100000000n ? 100000000n : next) / 1000000n));
                }}
              >
                Min. bid
              </button>
            </div>
            <p
              id="jubjub-amount-help"
              className={amountIssue ? 'text-red jubjub-helper' : 'jubjub-helper'}
            >
              {amountIssue || 'Minimum 100 P20 · steps of 50 P20'}
            </p>
            {prepared && (
              <Notice>
                Your saved payment is {formatP20(prepared.delta)} P20. Resume this bid before
                creating another.
              </Notice>
            )}
            {blockedBid && (
              <Notice>
                An earlier payment needs attention. Check{' '}
                <a className="text-link" href="#my-bid-orders">
                  My bid orders
                </a>{' '}
                and refresh its status before making another bid.
              </Notice>
            )}
            <dl className="jubjub-costs">
              <div>
                <dt>Current qualifying bid</dt>
                <dd>{stats ? `${formatP20(stats.qualifyingBidUnits)} P20` : '—'}</dd>
              </div>
              <div>
                <dt>Additional payment</dt>
                <dd>
                  {prepared
                    ? formatP20(prepared.delta)
                    : amount && !amountIssue
                      ? formatP20(parseP20(amount) - BigInt(confirmed?.total ?? '0'))
                      : '—'}{' '}
                  P20
                </dd>
              </div>
              <div>
                <dt>Gas cost</dt>
                <dd className="text-green">Sponsored</dd>
              </div>
              <div>
                <dt>Settlement</dt>
                <dd>Pay your bid</dd>
              </div>
            </dl>
            {!wallet.account ? (
              <button
                type="button"
                className="primary-button w-full"
                onClick={() => wallet.setModal(true)}
              >
                Connect wallet
              </button>
            ) : wallet.chainId !== 143 ? (
              <button
                type="button"
                className="primary-button w-full"
                disabled={wallet.busy}
                onClick={() => void wallet.switchChain(143)}
              >
                Switch to Monad
              </button>
            ) : !wallet.privacyAddress ? (
              <button
                type="button"
                className="primary-button w-full"
                disabled={wallet.busy}
                onClick={() => void wallet.authorizeRead(['address'])}
              >
                {wallet.busy ? 'Waiting for wallet…' : 'Unlock privacy wallet'}
              </button>
            ) : !session ? (
              <button
                type="button"
                className="primary-button w-full"
                disabled={busy || !dataReady}
                onClick={signIn}
              >
                <Fingerprint size={16} />
                {busy ? 'Waiting for wallet…' : 'Sign in to auction'}
              </button>
            ) : !supported ? (
              <Notice>
                Update and reload PLabs Wallet to enable JubJub bidding.{' '}
                <button type="button" className="text-button" onClick={signIn} disabled={busy}>
                  Check wallet again
                </button>
              </Notice>
            ) : (
              <button
                type="submit"
                className="primary-button w-full"
                disabled={
                  busy ||
                  !accountData ||
                  !!blockedBid ||
                  me.isError ||
                  (!prepared && (!active || !amount || !!amountIssue))
                }
              >
                {busy ? 'Waiting for wallet…' : prepared ? 'Review saved bid' : 'Review bid'}
                <ArrowUpRight size={16} />
              </button>
            )}
          </form>
          {busy && (
            <button type="button" className="text-button w-full" onClick={() => void wallet.open()}>
              Open wallet approval
            </button>
          )}
          {session && me.isPending && (
            <p role="status" className="jubjub-helper">
              Loading your position…
            </p>
          )}
          {session && me.isError && (
            <div role="alert" className="jubjub-error">
              Your bid status could not be loaded.{' '}
              <button type="button" className="text-button" disabled={busy} onClick={signIn}>
                Sign in again
              </button>
            </div>
          )}
          {message && (
            <p className="jubjub-feedback" role="status">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="jubjub-error">
              {error}
            </p>
          )}
          {wallet.readAuthorizationError && !wallet.privacyAddress && (
            <p role="alert" className="jubjub-error">
              {wallet.readAuthorizationError}
            </p>
          )}
          {session && (
            <div className="jubjub-position">
              <span className="eyebrow">YOUR POSITION</span>
              <dl>
                <div>
                  <dt>Privacy address</dt>
                  <dd title={wallet.privacyAddress} className="mono">
                    {short(wallet.privacyAddress)}
                  </dd>
                </div>
                <div>
                  <dt>Rank</dt>
                  <dd>{qualification?.rank?.toLocaleString() ?? '—'}</dd>
                </div>
                <div>
                  <dt>Allocation</dt>
                  <dd>
                    {qualification?.final
                      ? qualification.eligible
                        ? 'Eligible'
                        : 'Ineligible'
                      : 'Awaiting final result'}
                  </dd>
                </div>
              </dl>
              {ended && (
                <button
                  type="button"
                  className="secondary-button w-full"
                  disabled={busy || !accountData}
                  onClick={refund}
                >
                  Check settlement & refund
                </button>
              )}
              {refundMessage && (
                <p role="status" className="jubjub-feedback">
                  {refundMessage}
                </p>
              )}
            </div>
          )}
          <p className="jubjub-footnote">
            <Clock3 size={13} /> Keep your wallet available while it generates the proof. Pending
            bids can be resumed after a reload.
          </p>
        </Panel>
      </div>
      <Modal
        open={!!review}
        onOpenChange={(open) => !open && setReview(null)}
        title={review?.resumeId ? 'Resume this saved bid' : 'Review your bid'}
        description="Confirm the additional P20 payment before approving it in your wallet."
      >
        {review && (
          <>
            <dl className="jubjub-review">
              <div>
                <dt>Total bid</dt>
                <dd>{formatP20(review.total)} P20</dd>
              </div>
              <div>
                <dt>Additional payment</dt>
                <dd>{formatP20(review.delta)} P20</dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>Monad mainnet</dd>
              </div>
              <div>
                <dt>Recipient</dt>
                <dd>Official JubJub custody</dd>
              </div>
              <div>
                <dt>Gas</dt>
                <dd>Sponsored</dd>
              </div>
            </dl>
            <Notice>
              Your wallet independently verifies this bid and asks you to approve the private
              payment. Winners pay their own bid amount.
            </Notice>
            <button type="button" className="primary-button w-full" onClick={fund}>
              {review.resumeId ? 'Resume in wallet' : 'Continue to wallet'}
            </button>
          </>
        )}
      </Modal>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="jubjub-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
