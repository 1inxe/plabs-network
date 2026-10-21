import { useId, useMemo, useState } from 'react';
import { formatP20, type JubjubHistory, type JubjubSummary } from '@/services/platform/jubjub';
import { deriveBidDistribution } from './bid-distribution';
import { deriveSeatAllocation, type SeatAllocation } from './seat-allocation';

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
  seats,
  error = false,
}: {
  history?: JubjubHistory;
  summary?: JubjubSummary;
  seats?: number;
  error?: boolean;
}) {
  const methodId = useId();
  const [modelExpanded, setModelExpanded] = useState(true);
  const data = useMemo(
    () => deriveBidDistribution({ history: error ? undefined : history, summary }),
    [history, summary, error],
  );
  const allocation = useMemo(
    () => deriveSeatAllocation({ distribution: data, seats, summarySeats: summary?.auctionSeats }),
    [data, seats, summary?.auctionSeats],
  );
  const available = data.status === 'ready' || data.status === 'partial';
  const allocated = allocation.status === 'ready';
  const totalEntryUnits = data.bands.reduce((total, band) => total + BigInt(band.entryUnits), 0n);
  return (
    <section
      className="jubjub-distribution"
      aria-label="First-bid distribution"
      aria-describedby={methodId}
    >
      <div className="jubjub-analysis-toolbar">
        <div>
          <span className="eyebrow">HISTORICAL FIRST BIDS</span>
          <h3>First-bid distribution</h3>
        </div>
        <span className="jubjub-distribution-unit">P20</span>
      </div>
      <p id={methodId} className="jubjub-distribution-method">
        Estimated from public snapshots of first participation. The highest first bids fill the
        auction seats. Current per-bidder totals are private; later increases can change the live
        ranking and are not assigned to individual bidders in this estimate.
      </p>
      {available ? (
        <>
          <details
            className="jubjub-first-bid-model"
            open={modelExpanded}
            onToggle={(event) => setModelExpanded(event.currentTarget.open)}
          >
            <summary>Explore seat model using first bids only</summary>
            <p className="jubjub-topup-warning">
              This model excludes later increases and cannot determine current retained or out
              positions. Use the official live qualifying bid above for the current seat threshold.
            </p>
            {allocated ? (
              <SeatOverview
                allocation={allocation}
                participants={data.historyParticipants ?? 0}
                liveCutoff={
                  summary && !summary.unavailable ? summary.qualifyingBidUnits : undefined
                }
              />
            ) : (
              <div className="jubjub-seat-unavailable" role="status">
                {allocation.reason}
              </div>
            )}
            {allocated && allocation.retainedBands.length > 0 && (
              <section className="jubjub-retained" aria-label="Estimated retained bids by range">
                <div className="jubjub-analysis-toolbar">
                  <h4>Retained bids by range</h4>
                  <span>{allocation.retainedCount.toLocaleString()} estimated seat slots</span>
                </div>
                <p>
                  5,000–10,000 P20 is split into 1,000 P20 ranges. Shares use retained slots only.
                </p>
                <div className="jubjub-retained-grid">
                  {allocation.retainedBands.map((band) => (
                    <div
                      key={band.id}
                      className={`jubjub-retained-band ${band.atCutoff ? 'is-cutoff' : ''}`}
                      data-retained-band={band.id}
                    >
                      <div className="jubjub-retained-row">
                        <span>
                          {band.label} <small>P20</small>
                        </span>
                        <strong>
                          {band.count.toLocaleString()} <small>{percent(band.share)}</small>
                        </strong>
                      </div>
                      <div className="jubjub-retained-track" aria-hidden="true">
                        <span style={{ width: `${band.share}%` }} />
                      </div>
                      <div className="jubjub-retained-foot">
                        <span>
                          {formatP20(band.units, { maximumFractionDigits: 2 })} P20 initial
                        </span>
                        {band.atCutoff && <span>Cutoff range</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </details>
          <div className="jubjub-analysis-toolbar jubjub-all-bands-heading">
            <h4>All price bands</h4>
            <span>Highest → lowest</span>
          </div>
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
                  <th scope="col" className="jubjub-distribution-population-share">
                    Share
                  </th>
                  <th scope="col" className="jubjub-distribution-capital">
                    Initial P20
                  </th>
                  {modelExpanded && (
                    <>
                      <th scope="col" className="jubjub-seat-in">
                        Retained <small>first-bid model</small>
                      </th>
                      <th scope="col" className="jubjub-seat-out">
                        Out <small>first-bid model</small>
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {[...data.bands].reverse().map((band) => {
                  const seatBand = allocation.bands.find((item) => item.id === band.id);
                  return (
                    <tr
                      key={band.id}
                      data-band-id={band.id}
                      data-seat-state={modelExpanded ? (seatBand?.state ?? 'unknown') : 'unknown'}
                    >
                      <th scope="row">
                        {band.label}
                        {modelExpanded && seatBand?.state === 'mixed' && (
                          <span className="jubjub-band-cutoff">Seat line crosses this range</span>
                        )}
                        <small className="jubjub-distribution-mobile-capital">
                          {formatP20(band.entryUnits, { maximumFractionDigits: 2 })} P20 entered
                        </small>
                      </th>
                      <td>
                        <strong>{band.count.toLocaleString()}</strong>
                      </td>
                      <td className="jubjub-distribution-population-share">
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
                      {modelExpanded && (
                        <>
                          <td className="jubjub-seat-in">
                            {seatBand ? seatBand.retained.toLocaleString() : '—'}
                          </td>
                          <td className="jubjub-seat-out">
                            {seatBand ? seatBand.outside.toLocaleString() : '—'}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
                {data.unclassifiedParticipants > 0 && (
                  <tr className="jubjub-distribution-unknown" data-band-id="unknown">
                    <th scope="row">
                      Unclassified<small>Grouped or incomplete snapshots</small>
                    </th>
                    <td>
                      <strong>{data.unclassifiedParticipants.toLocaleString()}</strong>
                    </td>
                    <td className="jubjub-distribution-population-share">
                      {percent(data.unclassifiedShare)}
                    </td>
                    <td className="jubjub-distribution-capital">—</td>
                    {modelExpanded && (
                      <>
                        <td>—</td>
                        <td>—</td>
                      </>
                    )}
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
            This is a first-bid seat model, not the live allocation. Later increases cannot be
            matched to bidders. Final eligibility and equal-price ordering follow campaign
            settlement.
          </p>
          <p className="jubjub-analysis-note">
            Bands include their lower limit and exclude the upper limit, except 50,000–100,000
            includes 100,000. The final band is strictly above 100,000.
          </p>
          {data.unclassifiedParticipants > 0 && (
            <p className="jubjub-analysis-note">
              Some first bids cannot be assigned to a band; these positions stay unclassified
              instead of being split across ranges.
            </p>
          )}
          <p className="jubjub-analysis-note">
            {data.asOf !== null ? `History through ${dateLabel(data.asOf)}.` : ''}
            {data.summaryAhead ? ' Waiting for history to catch up with the latest totals.' : ''}{' '}
            All-band shares use all positions; retained-range shares use retained slots.
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

function SeatOverview({
  allocation: a,
  participants,
  liveCutoff,
}: {
  allocation: SeatAllocation;
  participants: number;
  liveCutoff?: string;
}) {
  const green = a.contested ? a.aboveCutoffCount : a.retainedCount;
  const amber = a.contested ? a.atCutoffCount : 0;
  const red = a.contested ? a.belowCutoffCount : a.outsideCount;
  const width = (count: number) => `${participants ? (count / participants) * 100 : 0}%`;
  return (
    <div className="jubjub-seat-overview">
      <div className="jubjub-seat-stats">
        <div>
          <span>AUCTION SEATS</span>
          <strong>{a.seats?.toLocaleString()}</strong>
          <small>
            {a.openSeats
              ? `${a.openSeats.toLocaleString()} seats still open in this model`
              : 'Highest first bids fill the seats'}
          </small>
        </div>
        <div className="jubjub-seat-in">
          <span>ESTIMATED RETAINED</span>
          <strong>{a.retainedCount.toLocaleString()}</strong>
          <small>of {participants.toLocaleString()} modeled positions</small>
        </div>
        <div className="jubjub-seat-out">
          <span>ESTIMATED OUT</span>
          <strong>{a.outsideCount.toLocaleString()}</strong>
          <small>
            {a.contested ? 'Includes unallocated equal-price slots' : 'Below the modeled seat line'}
          </small>
        </div>
      </div>
      <div className="jubjub-seat-cutoff">
        <span>
          Modeled seat line{' '}
          <strong>{a.cutoffUnits === null ? '—' : `${formatP20(a.cutoffUnits)} P20`}</strong>
        </span>
        {liveCutoff !== undefined && (
          <span>
            Live qualifying <strong>{formatP20(liveCutoff)} P20</strong>
          </span>
        )}
      </div>
      {participants > 0 && (
        <>
          <div
            className="jubjub-seat-rank"
            role="img"
            aria-label={`First bids ranked high to low: ${a.retainedCount} retained slots and ${a.outsideCount} outside slots${a.contested ? `; ${a.atCutoffCount} equal bids compete for ${a.cutoffSeats} cutoff slots` : ''}.`}
          >
            <div className="jubjub-seat-rank-segments" aria-hidden="true">
              <span className="is-in" style={{ width: width(green) }} />
              <span className="is-tie" style={{ width: width(amber) }} />
              <span className="is-out" style={{ width: width(red) }} />
            </div>
            {a.outsideCount > 0 && (
              <i
                className="jubjub-seat-rank-marker"
                style={{ left: width(a.retainedCount) }}
                aria-hidden="true"
              />
            )}
          </div>
          <div className="jubjub-seat-legend">
            <span className="is-in">
              {a.contested ? 'Above cutoff' : 'Retained'} · {green.toLocaleString()}
            </span>
            {a.contested && <span className="is-tie">Cutoff tie · {amber.toLocaleString()}</span>}
            <span className="is-out">
              {a.contested ? 'Below cutoff' : 'Out'} · {red.toLocaleString()}
            </span>
            <span className="jubjub-seat-direction">Higher bids ← → Lower bids</span>
          </div>
        </>
      )}
      {a.contested && (
        <p className="jubjub-seat-tie-note" role="note">
          {a.atCutoffCount.toLocaleString()} first bids share the {formatP20(a.cutoffUnits ?? '0')}{' '}
          P20 cutoff; {a.cutoffSeats.toLocaleString()} seat slots remain at that price. Individual
          tie-break winners are unknown.
        </p>
      )}
    </div>
  );
}
