import { useMemo, useState } from 'react';
import { formatP20, type JubjubHistory, type JubjubSummary } from '@/services/platform/jubjub';
import { deriveBidDistribution } from './bid-distribution';
import { deriveTopUpPeriod, topUpShare } from './top-up-analysis';

const periods = [
  { label: '15m', seconds: 900 },
  { label: '1h', seconds: 3600 },
  { label: 'All', seconds: null },
] as const;
const amount = (units: string) => formatP20(units, { maximumFractionDigits: 2 });

export function TopUpAnalysis({
  history,
  summary,
  now,
  error,
}: {
  history?: JubjubHistory;
  summary?: JubjubSummary;
  now: number;
  error: boolean;
}) {
  const [windowSeconds, setWindowSeconds] = useState<number | null>(null);
  const data = useMemo(
    () => deriveBidDistribution({ history: error ? undefined : history, summary }),
    [history, summary, error],
  );
  const period = useMemo(
    () => deriveTopUpPeriod(data, now, windowSeconds),
    [data, now, windowSeconds],
  );
  const available = data.status === 'ready' || data.status === 'partial';
  const share = topUpShare(data);
  return (
    <section className="jubjub-topups" aria-label="Additional bid funds">
      <div className="jubjub-analysis-toolbar">
        <div>
          <span className="eyebrow">BID INCREASES</span>
          <h3>Additional bid funds</h3>
        </div>
        <span className="muted">Observed public updates</span>
      </div>
      <p className="jubjub-analysis-note">
        Later bids are included in total committed P20. Here, increases are inferred when funded
        positions stay unchanged between consecutive snapshots. Updates count observations, not
        unique bidders; second and third bids cannot be distinguished.
      </p>
      {available ? (
        <>
          <div className="jubjub-topup-totals">
            <Metric
              label="Observed top-up P20"
              value={amount(data.topUpUnits)}
              detail="Cumulative additional funds in loaded history"
            />
            <Metric
              label="Top-up updates"
              value={data.topUpUpdates.toLocaleString()}
              detail="No new funded positions in these updates"
            />
            <Metric
              label="Share of committed P20"
              value={
                share === null
                  ? '—'
                  : `${share.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
              }
              detail="Uses totals at the same history snapshot"
            />
            <Metric
              label="Unattributed P20"
              value={data.unattributedUnits === null ? '—' : amount(data.unattributedUnits)}
              detail="Baseline, grouped, missing or inconsistent updates"
            />
          </div>
          <p className="jubjub-analysis-note" data-topup-reconciliation>
            {amount(data.bands.reduce((sum, band) => sum + BigInt(band.entryUnits), 0n).toString())}{' '}
            first bids
            {' + '}
            {amount(data.topUpUnits)} top-ups{' + '}
            {amount(data.unattributedUnits ?? '0')} unattributed
            {' = '}
            {amount(data.committedUnits ?? '0')} P20 committed in history.
          </p>
          {data.status === 'partial' && (
            <p className="jubjub-topup-warning" role="status">
              {data.reason} Counts and amounts show identified updates only; additional top-ups may
              be missing. Unattributed funds may include both first bids and increases.
            </p>
          )}
          <div className="jubjub-analysis-toolbar jubjub-topup-period">
            <h4>
              {windowSeconds === null
                ? 'All observed top-ups'
                : windowSeconds === 900
                  ? 'Top-ups · last 15 minutes'
                  : 'Top-ups · last hour'}
            </h4>
            <fieldset className="jubjub-range" aria-label="Top-up analysis period">
              {periods.map((period) => (
                <button
                  type="button"
                  key={period.label}
                  aria-pressed={windowSeconds === period.seconds}
                  onClick={() => setWindowSeconds(period.seconds)}
                >
                  {period.label}
                </button>
              ))}
            </fieldset>
          </div>
          <p className="jubjub-topup-period-total" data-topup-period-total>
            <strong>{amount(period.totalUnits)} P20</strong> across{' '}
            {period.updates.toLocaleString()} observed top-up updates
          </p>
          <div className="jubjub-distribution-table-wrap">
            <table
              className="jubjub-distribution-table"
              aria-label="Additional payment amount bands"
            >
              <thead>
                <tr>
                  <th scope="col">Added P20 per update</th>
                  <th scope="col">Updates</th>
                  <th scope="col">Added P20</th>
                </tr>
              </thead>
              <tbody>
                {period.bands.map((band) => (
                  <tr key={band.id} data-topup-band={band.id}>
                    <th scope="row">{band.label}</th>
                    <td>{band.updates.toLocaleString()}</td>
                    <td>{amount(band.units)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="jubjub-analysis-note">
            Bands describe additional payments, not total bids after an increase. History through{' '}
            {data.asOf === null
              ? '—'
              : new Date(data.asOf * 1000).toLocaleString(undefined, { hour12: false })}
            . Bidders cannot be moved between the first-bid ranges using these anonymous updates.
          </p>
        </>
      ) : (
        <p className="jubjub-distribution-empty" role="status">
          {error
            ? 'Top-up history is temporarily unavailable.'
            : (data.reason ?? 'Waiting for top-up history.')}
        </p>
      )}
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="jubjub-analysis-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}
