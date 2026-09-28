import { useEffect } from 'react';
import { formatRaw, short } from '@/shared/lib/format';
import { Badge, EmptyState, Notice } from '@/shared/ui';
import { useWallet } from '../model/WalletProvider';
import { WalletFeedback } from './WalletFeedback';
export function WalletNotes() {
  const w = useWallet(),
    granted = w.privacyScopes.includes('notes');
  useEffect(() => {
    if (granted) void w.loadNotes();
  }, [granted, w.loadNotes]);
  if (!granted)
    return (
      <EmptyState
        title="Your unspent notes"
        action={
          <>
            <button
              type="button"
              className="primary-button"
              disabled={w.busy}
              onClick={() => void w.authorizeRead(['address', 'notes'])}
            >
              Authorize note summaries
            </button>
            <WalletFeedback scope="notes" />
          </>
        }
      >
        Share note values and status. Spending secrets remain in PLabs Wallet.
      </EmptyState>
    );
  return (
    <div>
      {w.readError && (
        <button type="button" className="text-button" onClick={() => void w.loadNotes()}>
          Retry loading notes
        </button>
      )}
      <Notice>
        Commitment IDs, values and transaction references are visible to this site while access is
        granted.
      </Notice>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>NOTE</th>
              <th>AMOUNT</th>
              <th>STATE</th>
              <th>BLOCK</th>
            </tr>
          </thead>
          <tbody>
            {w.notes?.items.map((note) => (
              <tr key={`${note.poolAddress}:${note.id}`}>
                <td className="mono">{short(note.id)}</td>
                <td>
                  {formatRaw(note.valueRaw, note.decimals)} {note.symbol}
                </td>
                <td>
                  <Badge tone={note.spent ? 'gray' : note.confirmed ? 'green' : 'amber'}>
                    {note.spent ? 'Spent' : note.confirmed ? 'Spendable' : 'Pending'}
                  </Badge>
                </td>
                <td>{note.blockNumber || 'Unknown'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>{w.notes?.total ?? '—'} notes</span>
        <div>
          <button
            type="button"
            className="text-button"
            disabled={!w.notes || w.notes.page <= 1}
            onClick={() => void w.loadNotes((w.notes?.page ?? 1) - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className="text-button"
            disabled={!w.notes || w.notes.page >= w.notes.pages}
            onClick={() => void w.loadNotes((w.notes?.page ?? 1) + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
