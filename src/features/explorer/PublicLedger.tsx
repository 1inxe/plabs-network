import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Fingerprint, LockKeyhole, RefreshCw } from 'lucide-react';
import type { IndexerNetwork } from '@/services/indexer';
import { indexerQueries } from '@/services/indexer';
import { explorerUrl, formatRaw, short } from '@/shared/lib/format';
import { Badge, EmptyState, ExternalLink, Notice, Panel } from '@/shared/ui';
export function PublicLedger({ network, hash }: { network: IndexerNetwork; hash: string }) {
  const searching = /^0x[0-9a-f]{64}$/i.test(hash),
    feed = useInfiniteQuery({ ...indexerQueries.transactions(network), enabled: !searching }),
    search = useQuery(indexerQueries.transactionNotes(network, hash));
  const rows = [
    ...new Map(
      (feed.data?.pages.flatMap((page) => page.items) ?? []).map((row) => [row.hash, row]),
    ).values(),
  ];
  const chainId = network === 'monad' ? 143 : 1;
  return (
    <Panel className="explorer-ledger">
      <div className="panel-heading">
        <h2>
          <Fingerprint aria-hidden="true" size={18} />
          {searching ? 'Transaction commitments' : 'Public network activity'}
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Refresh public activity"
          onClick={() => void (searching ? search.refetch() : feed.refetch())}
        >
          <RefreshCw aria-hidden="true" size={15} />
        </button>
      </div>
      {(searching ? search.isError : feed.isError) && (
        <Notice>
          The official indexer is temporarily unavailable. Retry to refresh public activity.
        </Notice>
      )}
      {searching ? (
        <>
          {search.data?.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>COMMITMENT</th>
                    <th>POOL</th>
                    <th>ASSET</th>
                    <th>CONTENT</th>
                  </tr>
                </thead>
                <tbody>
                  {search.data.map((note) => (
                    <tr key={`${note.pool}:${note.cmx}`}>
                      <td className="mono">{short(note.cmx)}</td>
                      <td className="mono">{note.pool ? short(note.pool) : '—'}</td>
                      <td>{note.symbol ?? 'Private asset'}</td>
                      <td>
                        <Badge>
                          <LockKeyhole size={12} />
                          Encrypted
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title={
                search.isPending ? 'Looking up the transaction…' : 'No indexed commitments found'
              }
            >
              The transaction may not contain privacy outputs or may still be indexing.
            </EmptyState>
          )}
          <Notice>
            Private note decryption belongs in the wallet. This page never requests your OVK or
            viewing key.
          </Notice>
        </>
      ) : (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>TYPE</th>
                  <th>TRANSACTION</th>
                  <th>ASSET / PUBLIC AMOUNT</th>
                  <th>FROM</th>
                  <th>TO</th>
                  <th>BLOCK / TIME</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.hash}>
                    <td>
                      <Badge tone={row.type === 'unshield' ? 'amber' : 'green'}>{row.type}</Badge>
                    </td>
                    <td className="mono">
                      <ExternalLink href={explorerUrl(chainId, row.hash) ?? ''}>
                        {short(row.hash)}
                      </ExternalLink>
                    </td>
                    <td>
                      {row.publicAmount === null
                        ? 'Private'
                        : formatRaw(row.publicAmount, row.decimals)}{' '}
                      {row.symbol}
                    </td>
                    <td className="mono">{row.sender ? short(row.sender) : 'Shielded'}</td>
                    <td className="mono">{row.recipient ? short(row.recipient) : 'Shielded'}</td>
                    <td>
                      <span className="mono">#{row.block}</span>
                      <small className="block-time">
                        {row.time ? new Date(row.time).toLocaleString() : 'Time unavailable'}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <EmptyState
              title={
                feed.isPending
                  ? 'Loading official network activity…'
                  : 'No indexed activity to show'
              }
            />
          )}
          <div className="table-footer">
            <span>
              {rows.length} transactions · official {network} indexer
            </span>
            {feed.hasNextPage && (
              <button
                type="button"
                className="secondary-button"
                disabled={feed.isFetchingNextPage}
                onClick={() => void feed.fetchNextPage()}
              >
                {feed.isFetchingNextPage ? 'Loading…' : 'Load earlier transactions'}
              </button>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}
