import { useId, useMemo } from 'react';
import { formatP20, type JubjubHistory, type JubjubSummary } from '@/services/platform/jubjub';
import { deriveBidDistribution } from './bid-distribution';

const percent = (value: number) =>
  `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
const dateLabel = (at: number) =>
  new Date(at * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

export function BidDistribution({
  history,
  summary,
  error = false,
}: {
  history?: JubjubHistory;
  summary?: JubjubSummary;
  error?: boolean;
}) {
  const headingId = useId();
  const methodId = useId();
  const data = useMemo(
    () => deriveBidDistribution({ history: error ? undefined : history, summary }),
    [history, summary, error],
  );
  const available = data.status === 'ready' || data.status === 'partial';
  const totalEntryUnits = data.bands.reduce((total, band) => total + BigInt(band.entryUnits), 0n);
  return (
    <section
      className="jubjub-distribution"
      aria-labelledby={headingId}
      aria-describedby={methodId}
    >
      <div className="jubjub-analysis-toolbar">
        <h3 id={headingId}>First-bid distribution</h3>
        <span className="jubjub-distribution-unit">P20</span>
      </div>
      <p id={methodId} className="jubjub-distribution-method">
        Estimated from public snapshots of first participation. Current per-bidder totals are not
        public. Later bid increases do not move a participant into a different band here.
      </p>
      {available ? (
        <>
          <div className="jubjub-distribution-coverage">
            <span>
              <strong>{data.classifiedParticipants.toLocaleString()}</strong> /{' '}
              {data.historyParticipants?.toLocaleString() ?? '—'} positions classified
            </span>
            <span>{percent(data.coveragePercent)} coverage</span>
          </div>
          <div className="jubjub-distribution-table-wrap">
            <table className="jubjub-distribution-table" aria-label="First-bid amount bands">
              <thead>
                <tr>
                  <th scope="col">First bid · P20</th>
                  <th scope="col">Participants</th>
                  <th scope="col">Share</th>
                  <th scope="col" className="jubjub-distribution-capital">
                    Initial P20
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.bands.map((band) => (
                  <tr key={band.id} data-band-id={band.id}>
                    <th scope="row">
                      {band.label}
                      <small className="jubjub-distribution-mobile-capital">
                        {formatP20(band.entryUnits, { maximumFractionDigits: 2 })} P20 entered
                      </small>
                    </th>
                    <td>
                      <strong>{band.count.toLocaleString()}</strong>
                    </td>
                    <td>
                      <div className="jubjub-distribution-share">
                        <span>{percent(band.share)}</span>
                        <i aria-hidden="true">
                          <b style={{ width: `${Math.min(100, band.share)}%` }} />
                        </i>
                      </div>
                    </td>
                    <td
                      className="jubjub-distribution-capital"
                      title={`${formatP20(band.entryUnits)} P20`}
                    >
                      {formatP20(band.entryUnits, { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
                {data.unclassifiedParticipants > 0 && (
                  <tr className="jubjub-distribution-unknown" data-band-id="unknown">
                    <th scope="row">
                      Unclassified<small>Grouped or incomplete snapshots</small>
                    </th>
                    <td>
                      <strong>{data.unclassifiedParticipants.toLocaleString()}</strong>
                    </td>
                    <td>{percent(data.unclassifiedShare)}</td>
                    <td className="jubjub-distribution-capital">—</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="jubjub-distribution-summary">
            <span>
              <strong>{formatP20(totalEntryUnits, { maximumFractionDigits: 2 })} P20</strong> in
              classified first bids
            </span>
            <span>
              <strong>{data.topUpUpdates.toLocaleString()}</strong> later top-up updates excluded
              from participant counts
            </span>
          </div>
          <p className="jubjub-analysis-note">
            Bands include their lower limit and exclude the upper limit, except 50,000–100,000
            includes 100,000. The final band is strictly above 100,000.
          </p>
          {data.status === 'partial' && (
            <p className="jubjub-analysis-note">
              Some first bids cannot be assigned to a band; these positions stay unclassified
              instead of being split across ranges.
            </p>
          )}
          <p className="jubjub-analysis-note">
            {data.asOf !== null ? `History through ${dateLabel(data.asOf)}.` : ''}
            {data.summaryAhead ? ' Waiting for history to catch up with the latest totals.' : ''}{' '}
            Shares use all positions in this historical snapshot, including unclassified positions.
          </p>
        </>
      ) : (
        <div className="jubjub-distribution-empty" role="status">
          {error
            ? 'First-bid history is temporarily unavailable.'
            : (data.reason ?? 'Waiting for first-bid history.')}
        </div>
      )}
    </section>
  );
}
