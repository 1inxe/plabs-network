import { useId, useState } from 'react';
import { formatP20, type JubjubHistory } from '@/services/platform/jubjub';

const series = [
  { key: 'averageBidUnits', label: 'Average', color: 'var(--amber)' },
  { key: 'highestBidUnits', label: 'Highest', color: 'var(--accent)' },
  { key: 'qualifyingBidUnits', label: 'Qualifying', color: '#ba9ef7' },
] as const;
const ownKey = 'confirmedBid';
const amount = (value?: string) => (value === undefined ? undefined : Number(value) / 1e6);

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
  const chartId = useId();
  const hintId = useId();
  const [selected, setSelected] = useState<string[]>([...series.map(({ key }) => key), ownKey]);
  const rows = history?.rows ?? [];
  if (!rows.length)
    return (
      <div className="jubjub-chart-empty" role="status">
        Bid history will appear here when available.
      </div>
    );
  const own = amount(confirmedBid);
  const plots = [
    ...series.map(({ key, label, color }) => ({
      key,
      label: `${label}${key === 'qualifyingBidUnits' && seats ? ` #${seats.toLocaleString()}` : ''}`,
      color,
      latest: rows.at(-1)?.[key],
      values: rows.map((row) => amount(row[key])).filter((value) => value !== undefined),
    })),
    {
      key: ownKey,
      label: 'Your confirmed bid',
      color: 'var(--cyan)',
      latest: confirmedBid,
      values: own === undefined ? [] : [own],
    },
  ];
  const available = plots.filter(({ values }) => values.length > 0);
  const selection = selected.filter((key) => available.some((plot) => plot.key === key));
  const visible = selection.length ? selection : available.slice(0, 1).map(({ key }) => key);
  const values = plots.filter(({ key }) => visible.includes(key)).flatMap((plot) => plot.values);
  const low = values.reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY);
  const high = values.reduce((max, value) => Math.max(max, value), 0);
  const padding = Math.max(high - low, high * 0.05, 1) * 0.12;
  const min = Math.max(0, low - padding);
  const max = high + padding;
  const stride = Math.max(1, Math.ceil(rows.length / 1500));
  const chartRows = rows.filter((_, index) => index % stride === 0 || index === rows.length - 1);
  const first = rows[0]?.at ?? 0;
  const last = rows.at(-1)?.at ?? first;
  const duration = Math.max(1, last - first);
  const x = (at: number) => 68 + ((at - first) / duration) * 692;
  const y = (value: number) => 224 - ((value - min) / (max - min)) * 200;
  const spansDays = new Date(first * 1000).toDateString() !== new Date(last * 1000).toDateString();
  const time = (at: number) =>
    new Date(at * 1000).toLocaleString('en-GB', {
      ...(spansDays ? { month: 'short', day: 'numeric' } : {}),
      hour: '2-digit',
      minute: '2-digit',
    });
  const fullTime = (at: number) =>
    new Date(at * 1000).toLocaleString(undefined, { timeZoneName: 'short' });
  const chartValue = (value: number) =>
    value.toLocaleString('en-US', {
      maximumFractionDigits: max - min < 10 ? 2 : 0,
    });
  return (
    <div className="jubjub-chart">
      <svg
        id={chartId}
        viewBox="0 0 800 264"
        role="img"
        aria-labelledby={titleId}
        aria-describedby={hintId}
      >
        <title id={titleId}>
          JubJub bid history in P20:{' '}
          {plots
            .filter(({ key }) => visible.includes(key))
            .map(({ label }) => label)
            .join(', ')}
          . Visible range {chartValue(min)} to {chartValue(max)} P20.
        </title>
        {[0, 0.5, 1].map((fraction) => (
          <g key={fraction}>
            <line
              x1="68"
              x2="760"
              y1={y(min + (max - min) * fraction)}
              y2={y(min + (max - min) * fraction)}
            />
            <text x="56" y={y(min + (max - min) * fraction) + 4} textAnchor="end">
              {chartValue(min + (max - min) * fraction)}
            </text>
          </g>
        ))}
        {series
          .filter(({ key }) => visible.includes(key))
          .map(({ key, color }) => {
            let connected = false;
            const path = chartRows
              .map((row) => {
                const value = amount(row[key]);
                if (value === undefined) {
                  connected = false;
                  return '';
                }
                const command = connected ? 'L' : 'M';
                connected = true;
                return `${command}${x(row.at)},${y(value)}`;
              })
              .join(' ');
            return (
              <path
                key={key}
                d={path}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        {own !== undefined && visible.includes(ownKey) && (
          <path
            d={`M68,${y(own)} H760`}
            stroke="var(--cyan)"
            strokeWidth="2"
            strokeDasharray="6 5"
          />
        )}
        <text x="68" y="252">
          <title>{fullTime(first)}</title>
          {time(first)}
        </text>
        <text x="760" y="252" textAnchor="end">
          <title>{fullTime(last)}</title>
          {time(last)}
        </text>
      </svg>
      <div className="jubjub-chart-legend">
        {plots.map(({ key, label, color, latest, values: plotValues }) => {
          const pressed = visible.includes(key);
          const lastVisible = pressed && visible.length === 1;
          return (
            <button
              key={key}
              type="button"
              className="jubjub-chart-toggle"
              style={{ color }}
              aria-pressed={pressed}
              aria-controls={chartId}
              disabled={!plotValues.length || lastVisible}
              title={
                !plotValues.length
                  ? `${label} has no data yet`
                  : lastVisible
                    ? 'Keep at least one line visible'
                    : `${pressed ? 'Hide' : 'Show'} ${label.toLowerCase()}`
              }
              onClick={() =>
                setSelected(pressed ? visible.filter((item) => item !== key) : [...visible, key])
              }
            >
              <i aria-hidden="true" />
              {label}
              <strong>{latest === undefined ? '—' : `${formatP20(latest)} P20`}</strong>
            </button>
          );
        })}
      </div>
      <p id={hintId} className="jubjub-chart-hint">
        Select a legend item to show or hide its line. The price scale follows the visible lines.
        Hide Highest to compare the average and qualifying bids.
      </p>
    </div>
  );
}
