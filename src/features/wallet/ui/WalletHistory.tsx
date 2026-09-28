import { ChevronLeft, ChevronRight, Download, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { activityLabels } from '@/shared/config/product';
import { csvCell, explorerUrl, formatRaw, short } from '@/shared/lib/format';
import { Badge, EmptyState, ExternalLink } from '@/shared/ui';
import { useWallet } from '../model/WalletProvider';
import { WalletActivityList } from './WalletActivityList';
import { WalletFeedback } from './WalletFeedback';
export function WalletHistory({
  variant = 'table',
  preview = false,
}: {
  variant?: 'table' | 'list';
  preview?: boolean;
}) {
  const w = useWallet(),
    granted = w.privacyScopes.includes('history');
  useEffect(() => {
    if (granted) void w.loadHistory();
  }, [granted, w.loadHistory]);
  const history = preview && w.history?.page !== 1 ? null : w.history;
  const entries = preview ? (history?.items ?? []).slice(0, 3) : (history?.items ?? []);
  function download() {
    const text = [
      'Type,Asset,Amount,Status,Transaction,Time,Block',
      ...entries.map((row) =>
        [
          row.kind,
          row.symbol,
          formatRaw(row.amountRaw, row.decimals),
          row.status,
          row.txHash ?? '',
          row.createdAt ? new Date(row.createdAt).toISOString() : '',
          String(row.blockNumber ?? ''),
        ]
          .map(csvCell)
          .join(','),
      ),
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plabs-wallet-history-page.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!granted)
    return (
      <EmptyState
        title={preview ? 'Transaction history is private' : 'Read your wallet history'}
        action={
          <>
            <button
              type="button"
              className="primary-button"
              disabled={w.busy}
              onClick={() => void w.authorizeRead(['address', 'history'])}
            >
              Authorize wallet history
            </button>
            <WalletFeedback scope="history" />
          </>
        }
      >
        Transactions recorded by your wallet and received notes are shared only after your approval.
      </EmptyState>
    );
  return (
    <div className="wallet-history">
      {!preview && (
        <div className="wallet-section-heading">
          <span>
            {w.history
              ? `${w.history.total} records · ${w.history.syncComplete ? 'wallet synchronized' : 'partial wallet history'}`
              : w.readError
                ? 'History unavailable'
                : 'Reading history…'}
          </span>
          <div>
            <button
              type="button"
              className="secondary-button"
              disabled={!entries.length}
              onClick={download}
            >
              <Download aria-hidden="true" size={13} />
              Export page
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Refresh wallet history"
              onClick={() => void w.loadHistory(w.history?.page ?? 1)}
            >
              <RefreshCw aria-hidden="true" size={14} />
            </button>
          </div>
        </div>
      )}
      {!preview && (
        <p className="wallet-history-caption">
          Privacy activity recorded by your wallet. Received outputs can include change; imported
          wallets may have incomplete historical records.
        </p>
      )}
      {preview && !history && !w.readError && (
        <p className="wallet-history-caption" role="status">
          Loading transactions…
        </p>
      )}
      {variant === 'list' ? (
        <WalletActivityList items={entries} />
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>TYPE</th>
                <th>ASSET / AMOUNT</th>
                <th>TRANSACTION</th>
                <th>TIME / BLOCK</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Badge tone={row.kind === 'unshield' ? 'amber' : 'green'}>
                      {activityLabels[row.kind]}
                    </Badge>
                  </td>
                  <td>
                    {formatRaw(row.amountRaw, row.decimals)}{' '}
                    <span className="muted">{row.symbol}</span>
                  </td>
                  <td>
                    {row.txHash && explorerUrl(row.chainId, row.txHash) ? (
                      <ExternalLink href={explorerUrl(row.chainId, row.txHash) ?? ''}>
                        {short(row.txHash)}
                      </ExternalLink>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {row.createdAt
                      ? new Date(row.createdAt).toLocaleString()
                      : row.blockNumber
                        ? `Block ${row.blockNumber}`
                        : 'Unknown'}
                  </td>
                  <td>
                    <Badge
                      tone={
                        row.status === 'confirmed'
                          ? 'green'
                          : row.status === 'failed'
                            ? 'red'
                            : 'amber'
                      }
                    >
                      {row.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {history && !entries.length && (
        <EmptyState title="No wallet records available">
          Finish synchronizing your wallet to discover received notes.
        </EmptyState>
      )}
      {!preview && (
        <div className="table-footer">
          <span>
            Page {w.history?.page ?? 1} / {w.history?.pages ?? 1}
          </span>
          <div>
            <button
              type="button"
              className="icon-button"
              aria-label="Previous history page"
              disabled={!w.history || w.history.page <= 1}
              onClick={() => void w.loadHistory((w.history?.page ?? 1) - 1)}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Next history page"
              disabled={!w.history || w.history.page >= w.history.pages}
              onClick={() => void w.loadHistory((w.history?.page ?? 1) + 1)}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
