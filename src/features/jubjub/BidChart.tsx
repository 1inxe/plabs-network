import { useId } from 'react';
import { formatP20, type JubjubHistory } from '@/services/platform/jubjub';

const series = [
  { key: 'averageBidUnits', label: 'Average', color: 'var(--amber)' },
  { key: 'highestBidUnits', label: 'Highest', color: 'var(--accent)' },
  { key: 'qualifyingBidUnits', label: 'Qualifying', color: '#ba9ef7' },
] as const;

export function BidChart({
  history,
  confirmedBid,
  seats,
}: {
  history?: JubjubHistory;
  confirmedBid?: string;
  seats?: number;
}) {
  const titleId = useId();
  const rows = history?.rows ?? [];
  if (!rows.length)
    return <div className="jubjub-chart-empty">Bid history will appear here when available.</div>;
  const values = rows.flatMap((row) => series.map(({ key }) => Number(row[key] ?? 0) / 1e6));
  const own = confirmedBid ? Number(confirmedBid) / 1e6 : 0;
  const max =
    values.reduce((highest, value) => Math.max(highest, value), Math.max(own, 100)) * 1.12;
  const stride = Math.max(1, Math.ceil(rows.length / 1500));
  const chartRows = rows.filter((_, index) => index % stride === 0 || index === rows.length - 1);
  const first = rows[0]?.at ?? 0;
  const last = rows.at(-1)?.at ?? first;
  const duration = Math.max(1, last - first);
  const x = (at: number) => 68 + ((at - first) / duration) * 692;
  const y = (value: number) => 224 - (value / max) * 200;
  const time = (at: number) =>
    new Date(at * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="jubjub-chart">
      <svg viewBox="0 0 800 264" role="img" aria-labelledby={titleId}>
        <title id={titleId}>
          JubJub bid history in P20: average, highest, qualifying at rank {seats ?? '—'}
          {confirmedBid ? ', and your confirmed bid' : ''}
        </title>
        {[0, 0.5, 1].map((fraction) => (
          <g key={fraction}>
            <line x1="68" x2="760" y1={y(max * fraction)} y2={y(max * fraction)} />
            <text x="56" y={y(max * fraction) + 4} textAnchor="end">
              {(max * fraction).toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </text>
          </g>
        ))}
        {series.map(({ key, color }) => (
          <polyline
            key={key}
            points={chartRows
              .map((row) => `${x(row.at)},${y(Number(row[key] ?? 0) / 1e6)}`)
              .join(' ')}
            fill="none"
            stroke={color}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {confirmedBid && (
          <path
            d={`M68,${y(own)} H760`}
            stroke="var(--cyan)"
            strokeWidth="2"
            strokeDasharray="6 5"
          />
        )}
        <text x="68" y="252">
          {time(first)}
        </text>
        <text x="760" y="252" textAnchor="end">
          {time(last)}
        </text>
      </svg>
      <div className="jubjub-chart-legend">
        {series.map(({ key, label, color }) => (
          <span key={key} style={{ color }}>
            <i />
            {label}
            {key === 'qualifyingBidUnits' && seats ? ` #${seats.toLocaleString()}` : ''}
            <strong>{formatP20(rows.at(-1)?.[key] ?? '0')} P20</strong>
          </span>
        ))}
        <span style={{ color: 'var(--cyan)' }}>
          <i />
          Your confirmed bid<strong>{confirmedBid ? `${formatP20(confirmedBid)} P20` : '—'}</strong>
        </span>
      </div>
    </div>
  );
}
