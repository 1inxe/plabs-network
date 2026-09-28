import { ArrowLeftRight, ArrowUpRight, Download, RefreshCw, Search, Shield } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useWallet, WalletHistory } from '@/features/wallet';
import { activityLabels } from '@/shared/config/product';
import { csvCell, short } from '@/shared/lib/format';
import {
  Badge,
  CopyButton,
  EmptyState,
  ExternalLink,
  Modal,
  Notice,
  PageHeading,
  Panel,
  Segmented,
} from '@/shared/ui';

const scan = (chain: number) =>
  chain === 1 ? 'https://etherscan.io' : chain === 143 ? 'https://monadscan.com' : null;
export function HistoryPage() {
  const w = useWallet();
  const [params] = useSearchParams();
  const [source, setSource] = useState(params.get('source') === 'session' ? 'session' : 'wallet');
  const [filter, setFilter] = useState('all'),
    [search, setSearch] = useState(''),
    [range, setRange] = useState('all'),
    [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = w.activities.find((activity) => activity.id === selectedId) ?? null;
  const filtered = w.activities.filter(
    (a) =>
      (filter === 'all' || a.kind === filter) &&
      `${a.id} ${a.txHash || ''} ${a.symbol}`.toLowerCase().includes(search.toLowerCase()) &&
      (range === 'all' || a.createdAt > Date.now() - Number(range) * 86400000),
  );
  function exportCsv() {
    const csv = [
      'Type,Amount,Asset,Status,Transaction,Time',
      ...filtered.map((a) =>
        [a.kind, a.amount, a.symbol, a.state, a.txHash || a.id, new Date(a.createdAt).toISOString()]
          .map(csvCell)
          .join(','),
      ),
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plabs-session-activity.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="page">
      <PageHeading
        eyebrow="YOUR PRIVATE ACTIVITY"
        title="Activity"
        description="Your wallet’s privacy activity and transactions initiated on this site."
        action={
          <Segmented
            value={source}
            onChange={setSource}
            items={[
              { value: 'wallet', label: 'Wallet history' },
              { value: 'session', label: 'This session' },
            ]}
          />
        }
      />
      {source === 'wallet' ? (
        <Panel className="history-panel wallet-history-panel">
          <WalletHistory />
        </Panel>
      ) : (
        <>
          <div className="stats-grid four">
            {[
              { title: 'Total transactions', value: w.activities.length, foot: 'This session' },
              {
                title: 'Confirmed',
                value: w.activities.filter((a) => a.state === 'confirmed').length,
                foot: 'Wallet-reported status',
              },
              {
                title: 'Pending',
                value: w.activities.filter((a) => a.state === 'pending').length,
                foot: 'Awaiting confirmation',
              },
              { title: 'Privacy notes', value: '••••', foot: 'Protected in your wallet' },
            ].map((x) => (
              <Panel className="stat-card" key={x.title}>
                <div>
                  {x.title}
                  <Shield aria-hidden="true" size={16} />
                </div>
                <strong>{x.value}</strong>
                <small>{x.foot}</small>
              </Panel>
            ))}
          </div>
          <Panel className="history-panel">
            <div className="history-toolbar">
              <div className="search-box">
                <Search aria-hidden="true" size={16} />
                <input
                  aria-label="Filter activity"
                  placeholder="Search hash or asset…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Segmented
                value={filter}
                onChange={setFilter}
                items={[
                  { value: 'all', label: 'All' },
                  { value: 'shield', label: 'Deposits' },
                  { value: 'send', label: 'Transfers' },
                  { value: 'unshield', label: 'Withdrawals' },
                ]}
              />
              <select
                aria-label="Activity date range"
                className="plain-select"
                value={range}
                onChange={(e) => setRange(e.target.value)}
              >
                <option value="all">All session activity</option>
                <option value="1">Last 24 hours</option>
                <option value="30">Last 30 days</option>
              </select>
              <button
                type="button"
                className="secondary-button"
                onClick={exportCsv}
                disabled={!filtered.length}
              >
                <Download aria-hidden="true" size={14} />
                Export CSV
              </button>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>TYPE</th>
                    <th>TRANSACTION</th>
                    <th>AMOUNT</th>
                    <th>NETWORK</th>
                    <th>TIME</th>
                    <th>STATUS</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <Badge tone={a.kind === 'unshield' ? 'amber' : 'green'}>
                          <ArrowLeftRight aria-hidden="true" size={12} />
                          {activityLabels[a.kind]}
                        </Badge>
                      </td>
                      <td className="mono">
                        {short(a.txHash || a.id)}
                        <CopyButton value={a.txHash || a.id} />
                      </td>
                      <td>
                        <strong>{a.amount}</strong> <span className="muted">{a.symbol}</span>
                      </td>
                      <td>
                        {a.chainId === 143 ? 'Monad' : a.chainId === 1 ? 'Ethereum' : a.chainId}
                      </td>
                      <td className="mono">{new Date(a.createdAt).toLocaleTimeString()}</td>
                      <td>
                        <Badge
                          tone={
                            a.state === 'failed' ? 'red' : a.state === 'pending' ? 'amber' : 'green'
                          }
                        >
                          {a.state}
                        </Badge>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setSelectedId(a.id)}
                        >
                          Details
                          <ArrowUpRight aria-hidden="true" size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!filtered.length && (
              <EmptyState
                title={w.activities.length ? 'No matching transactions' : 'No activity yet'}
                action={
                  <Link to="/assets" className="primary-button">
                    Go to assets
                    <ArrowUpRight aria-hidden="true" size={15} />
                  </Link>
                }
              >
                {w.activities.length
                  ? 'Try a different asset, type or date range.'
                  : 'Your shielded journey starts with your first transaction. Only activity from this page session is shown.'}
              </EmptyState>
            )}
            <div className="table-footer">
              <span>{filtered.length} activities</span>
              <span>Session only · cleared on account / network changes</span>
            </div>
          </Panel>
        </>
      )}
      <div className="prover-banner">
        <Shield aria-hidden="true" size={22} />
        <div>
          <h3>Your history, on your terms.</h3>
          <p>
            No browser vault, no background note scanning. View your complete ledger directly in
            your wallet.
          </p>
        </div>
        <button type="button" className="secondary-button" onClick={() => void w.open()}>
          Open wallet
          <ArrowUpRight aria-hidden="true" size={14} />
        </button>
      </div>
      <Modal
        open={!!selected}
        onOpenChange={(v) => !v && setSelectedId(null)}
        title="Transaction details"
        description="Status returned by PLabs Wallet for this request."
      >
        {selected && (
          <>
            <div className="details-list">
              <span>Operation</span>
              <strong>{selected.kind}</strong>
              <span>Amount</span>
              <strong>
                {selected.amount} {selected.symbol}
              </strong>
              <span>Operation ID</span>
              <code className="break-all">{selected.id}</code>
              <span>Status</span>
              <Badge>
                {w.activities.find((a) => a.id === selected.id)?.state || selected.state}
              </Badge>
            </div>
            {selected.message && <Notice>{selected.message}</Notice>}
            <button
              type="button"
              className="primary-button w-full"
              disabled={w.busy}
              onClick={() => void w.refreshStatus(selected.id)}
            >
              <RefreshCw aria-hidden="true" size={15} />
              Refresh status
            </button>
            {(w.activities.find((a) => a.id === selected.id)?.txHash || selected.txHash) &&
              scan(selected.chainId) && (
                <ExternalLink
                  href={`${scan(selected.chainId)}/tx/${w.activities.find((a) => a.id === selected.id)?.txHash || selected.txHash}`}
                >
                  View on explorer
                </ExternalLink>
              )}
          </>
        )}
      </Modal>
    </div>
  );
}
