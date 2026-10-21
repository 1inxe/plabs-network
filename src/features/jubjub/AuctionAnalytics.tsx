import { Activity, ArrowUpRight, Users } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import {
  formatP20,
  type JubjubConfig,
  type JubjubHistory,
  type JubjubSummary,
} from '@/services/platform/jubjub';
import { Panel } from '@/shared/ui';
import { deriveAuctionAnalytics, type ParticipationPoint } from './auction-analytics';
import { BidDistribution } from './BidDistribution';
import { TopUpAnalysis } from './TopUpAnalysis';

const windows = [
  { label: '15m', seconds: 900 },
  { label: '1h', seconds: 3600 },
  { label: 'All', seconds: null },
] as const;
const integer = (value: number | null | undefined) =>
  value == null ? '—' : value.toLocaleString();
function signedCount(value: number | null) {
  return value === null
    ? '—'
    : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toLocaleString()}`;
}
function signedP20(value: string | null) {
  if (value === null) return '—';
  const amount = BigInt(value);
  return `${amount > 0n ? '+' : amount < 0n ? '−' : ''}${formatP20(amount < 0n ? -amount : amount, { maximumFractionDigits: 2 })}`;
}
const time = (at: number) =>
  new Date(at * 1000).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

export function AuctionAnalytics({
  config,
  summary,
  history,
  now,
  live,
  historyError,
}: {
  config?: JubjubConfig;
  summary?: JubjubSummary;
  history?: JubjubHistory;
  now: number;
  live: boolean;
  historyError: boolean;
}) {
  const [windowSeconds, setWindowSeconds] = useState<number | null>(3600);
  const titleId = useId();
  const analytics = useMemo(
    () =>
      deriveAuctionAnalytics({
        summary,
        history: historyError ? undefined : history,
        now,
        windowSeconds,
        seats: config?.rules.auctionSeats,
        startsAt: config?.rules.startsAt,
      }),
    [summary, history, historyError, now, windowSeconds, config],
  );
  const rangeLabel =
    windowSeconds === null
      ? 'Since the auction opened'
      : windowSeconds === 900
        ? 'Last 15 minutes'
        : 'Last hour';
  const availableHistory =
    analytics.historyStatus === 'ready' || analytics.historyStatus === 'incomplete';
  const mean = analytics.perParticipantMeanUnits;
  const share = analytics.occupancyPercent;
  const perBidder =
    analytics.participants && analytics.bidTransactions !== null
      ? (analytics.bidTransactions / analytics.participants).toLocaleString(undefined, {
          maximumFractionDigits: 2,
        })
      : null;
  return (
    <Panel className="jubjub-analytics">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">BIDS & PARTICIPATION</span>
          <h2 id={titleId}>Auction activity</h2>
        </div>
        <span className={`jubjub-analysis-live ${live ? '' : 'is-stale'}`}>
          <span className={`status-dot ${live ? '' : 'muted'}`} />
          {live ? 'Live' : summary ? 'Last known totals' : 'Awaiting data'}
        </span>
      </div>
      <section className="jubjub-analysis-totals" aria-labelledby={titleId}>
        <Stat
          label="Funded bidders"
          value={integer(analytics.participants)}
          detail={
            summary?.registeredPositions !== undefined
              ? `${integer(summary.registeredPositions)} registered positions`
              : 'Privacy positions with a funded bid'
          }
        />
        <Stat
          label="Confirmed bids"
          value={integer(analytics.bidTransactions)}
          detail={
            perBidder ? `${perBidder} bids per funded position` : 'Includes new bids and increases'
          }
        />
        <Stat
          label="Average per bidder"
          value={mean === null ? '—' : formatP20(mean, { maximumFractionDigits: 2 })}
          unit={mean !== null ? 'P20' : undefined}
          detail="Total committed ÷ funded positions"
        />
        <Stat
          label="Seat demand"
          value={
            share === null
              ? '—'
              : `${share.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
          }
          detail={
            analytics.overCapacity
              ? `${integer(analytics.overCapacity)} positions beyond seat count`
              : analytics.unfilledSeats !== null
                ? `${integer(analytics.unfilledSeats)} seats not yet matched by bids`
                : 'Funded positions ÷ auction seats'
          }
        />
      </section>
      <div className="jubjub-seat-demand">
        <div>
          <Users size={14} />
          <span>
            {integer(analytics.participants)} funded positions{' '}
            <span className="muted">/ {integer(analytics.seats)} seats</span>
          </span>
        </div>
        <div className="jubjub-demand-track" aria-hidden="true">
          <span style={{ width: `${Math.min(100, share ?? 0)}%` }} />
        </div>
        <p>
          {summary && share !== null ? (
            <>
              {share >= 100
                ? 'Funded positions have reached the seat count.'
                : 'Funded positions are still below the seat count.'}{' '}
              Current qualifying bid: <strong>{formatP20(summary.qualifyingBidUnits)} P20</strong>.
              Allocation is determined at final settlement.
            </>
          ) : (
            'Participation and the qualifying bid will appear when verified totals are available.'
          )}
        </p>
      </div>
      <TopUpAnalysis history={history} summary={summary} now={now} error={historyError} />
      <BidDistribution
        history={history}
        summary={summary}
        seats={config?.rules.auctionSeats}
        error={historyError}
      />
      <div className="jubjub-analysis-window">
        <div className="jubjub-analysis-toolbar">
          <h3>{rangeLabel}</h3>
          <fieldset className="jubjub-range" aria-label="Auction analysis period">
            {windows.map((window) => (
              <button
                type="button"
                key={window.label}
                aria-pressed={windowSeconds === window.seconds}
                onClick={() => setWindowSeconds(window.seconds)}
              >
                {window.label}
              </button>
            ))}
          </fieldset>
        </div>
        <div className="jubjub-window-totals">
          <Stat
            label="Funded bidder change"
            value={signedCount(analytics.window.newParticipants)}
          />
          <Stat
            label="Committed P20 change"
            value={signedP20(analytics.window.committedDeltaUnits)}
          />
          <Stat
            label="Public updates"
            value={availableHistory ? integer(analytics.window.updates) : '—'}
          />
        </div>
        {availableHistory &&
        !analytics.window.hasGaps &&
        analytics.participationTrend.length > 0 ? (
          <ParticipationChart
            points={analytics.participationTrend}
            from={analytics.window.from}
            to={analytics.window.to}
            through={analytics.window.through ?? analytics.window.to}
          />
        ) : (
          <div className="jubjub-participation-empty" role="status">
            {analytics.window.hasGaps
              ? 'A gap in public history prevents a continuous participation chart.'
              : historyError
                ? 'Participation history is temporarily unavailable.'
                : 'Waiting for participation history.'}
          </div>
        )}
        {analytics.summaryAhead && analytics.window.through !== null && (
          <p className="jubjub-analysis-note">
            Activity through {time(analytics.window.through)}; waiting for history to catch up with
            the latest totals.
          </p>
        )}
        {!analytics.window.complete && !analytics.summaryAhead && availableHistory && (
          <p className="jubjub-analysis-note">
            Only part of this period is available. Changes without a complete baseline are shown as
            —.
          </p>
        )}
        {analytics.window.adjustmentCount > 0 && (
          <p className="jubjub-analysis-note">
            This period includes adjustments to published totals; changes may be negative.
          </p>
        )}
      </div>
      <div className="jubjub-recent-activity">
        <div className="jubjub-analysis-toolbar">
          <h3>
            <Activity size={14} /> Recent activity
          </h3>
          <span className="muted">{rangeLabel}</span>
        </div>
        <p className="jubjub-analysis-note">
          Bidder names and addresses are private. Each row shows a change in public totals,
          including additional P20 paid, rather than an individual’s full bid.
        </p>
        {analytics.activity.length > 0 ? (
          <div className="jubjub-activity-scroll">
            <table aria-label="Recent public auction activity">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Update</th>
                  <th scope="col">P20 change</th>
                  <th scope="col">Bidder change</th>
                </tr>
              </thead>
              <tbody>
                {analytics.activity.map((entry) => (
                  <tr key={entry.sequence}>
                    <td>
                      <time
                        dateTime={new Date(entry.timestamp * 1000).toISOString()}
                        title={new Date(entry.timestamp * 1000).toLocaleString()}
                      >
                        {time(entry.timestamp)}
                      </time>
                    </td>
                    <td>
                      <span className={`jubjub-activity-kind ${entry.kind}`}>
                        <ArrowUpRight size={12} />
                        {entry.kind === 'new-bidders'
                          ? 'New participation'
                          : entry.kind === 'increase'
                            ? 'Added funds'
                            : 'Adjustment'}
                      </span>
                      {entry.hasGap && <small>Across a history gap</small>}
                    </td>
                    <td
                      className={
                        entry.committedDeltaUnits.startsWith('-') ? 'text-amber' : 'text-green'
                      }
                    >
                      {signedP20(entry.committedDeltaUnits)}
                    </td>
                    <td>{signedCount(entry.positionsDelta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="jubjub-no-activity">
            {availableHistory
              ? 'No public updates in this period.'
              : 'Recent activity will appear when history is available.'}
          </p>
        )}
      </div>
      <div className="jubjub-analysis-footer">
        <span>Totals refresh every 5s · history every 15s</span>
        <span>
          {summary ? `Totals as of ${time(summary.serverTime)}` : 'Waiting for live totals'}
        </span>
      </div>
      <p className="jubjub-analysis-method">
        Bidders count funded privacy positions, not verified unique people. Average per bidder
        differs from the auction’s seat-based average in the price chart. Public updates are history
        changes, not a count of unique bidders.
      </p>
    </Panel>
  );
}

function Stat({
  label,
  value,
  unit,
  detail,
}: {
  label: string;
  value: string;
  unit?: string;
  detail?: string;
}) {
  return (
    <div className="jubjub-analysis-stat">
      <span>{label}</span>
      <strong>
        {value}
        {unit && <small> {unit}</small>}
      </strong>
      {detail && <p>{detail}</p>}
    </div>
  );
}

function ParticipationChart({
  points,
  from,
  to,
  through,
}: {
  points: ParticipationPoint[];
  from: number;
  to: number;
  through: number;
}) {
  const id = useId();
  const sampled = points.filter(
    (_, index) =>
      index % Math.max(1, Math.ceil(points.length / 1000)) === 0 || index === points.length - 1,
  );
  const high = Math.max(1, ...sampled.map((point) => point.positions));
  const x = (at: number) => 52 + ((at - from) / Math.max(1, to - from)) * 680;
  const y = (positions: number) => 128 - (positions / high) * 100;
  const first = sampled[0];
  if (!first) return null;
  let path = `M${x(first.at)},${y(first.positions)}`;
  for (const point of sampled.slice(1)) path += ` H${x(point.at)} V${y(point.positions)}`;
  path += ` H${x(Math.max(first.at, Math.min(to, through)))}`;
  const shortTime = (at: number) =>
    new Date(at * 1000).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  return (
    <div className="jubjub-participation-chart">
      <div className="jubjub-participation-label">
        <Users size={12} /> Funded bidders over time
      </div>
      <svg viewBox="0 0 760 158" role="img" aria-labelledby={id}>
        <title id={id}>Funded privacy positions in the selected period</title>
        {[0, high].map((value) => (
          <g key={value}>
            <line x1="52" x2="732" y1={y(value)} y2={y(value)} />
            <text x="42" y={y(value) + 4} textAnchor="end">
              {integer(value)}
            </text>
          </g>
        ))}
        <path
          d={path}
          stroke="var(--cyan)"
          strokeWidth="2"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        <text x="52" y="152">
          {shortTime(from)}
        </text>
        <text x="732" y="152" textAnchor="end">
          {shortTime(to)}
        </text>
      </svg>
    </div>
  );
}
