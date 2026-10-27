import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  loadNftCollection,
  loadNftIssued,
  type NftCollection,
  type NftPool,
  nftCollectionPath,
  nftPhase,
} from '@/services/platform/nft-launch';
import { errorMessage } from '@/shared/api/errors';
import { short } from '@/shared/lib/format';
import { Badge, EmptyState } from '@/shared/ui';
import { AllocationCheck } from './AllocationCheck';
import { MintPanel } from './MintPanel';
import { NftArtwork, useNftManifest } from './NftArtwork';
import { PrivaSeaNav } from './PrivaSeaNav';
import { useNftPool } from './useNftPool';

const PAGE_SIZE = 24;
const saleLabels = {
  free: 'Free mint',
  fixed: 'Fixed price',
  english: 'English auction',
  privacy: 'Privacy auction',
};
function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="text-button mono"
      title={value}
      aria-label={`Copy ${value}`}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(
          () => setCopied(true),
          () => setCopied(false),
        );
      }}
    >
      {copied ? 'Copied' : short(value)} <Copy size={12} aria-hidden="true" />
    </button>
  );
}
function CollectionView({ collection, tokenId }: { collection: NftCollection; tokenId?: string }) {
  const [params, setParams] = useSearchParams();
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(Date.now);
  const changed = useCallback(() => setRevision((value) => value + 1), []);
  const status = useNftPool(collection.pool);
  const issued = useQuery({
    queryKey: ['nft', 'issued', collection.pool, revision],
    queryFn: ({ signal }) => loadNftIssued(collection, signal),
    refetchInterval: 30000,
    staleTime: 15000,
    retry: false,
  });
  const manifest = useNftManifest(collection);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const pool = status.data;
  const minted = pool?.minted ?? collection.minted;
  const phase = nftPhase(collection, pool, now);
  const mintById = new Map(pool?.mints.map((row) => [row.tokenId, row]));
  const listingById = new Map(pool?.listings.map((row) => [row.tokenId, row]));
  const mintedIds = new Set([...(issued.data?.tokenIds ?? []), ...mintById.keys()]);
  const known = !!issued.data || (!!pool && !pool.stale && pool.mints.length === pool.minted);
  const tab = params.get('tab') === 'activity' ? 'activity' : 'items';
  const filter = params.get('filter') ?? 'all';
  const search = params.get('search') ?? '';
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    next.delete('page');
    setParams(next, { replace: true });
  };
  const ids = Array.from({ length: Math.min(collection.supply, 100_000) }, (_, i) =>
    String(i + 1),
  ).filter(
    (id) =>
      (!search || id.includes(search.replace(/^#/, ''))) &&
      (filter === 'minted'
        ? mintedIds.has(id)
        : filter === 'unminted'
          ? known && !mintedIds.has(id)
          : filter === 'listed'
            ? listingById.has(id)
            : true),
  );
  const pages = Math.max(1, Math.ceil(ids.length / PAGE_SIZE));
  const page = Math.max(
    0,
    Math.min(pages - 1, Number.parseInt(params.get('page') ?? '0', 10) || 0),
  );
  const pageChange = (value: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(value));
    setParams(next);
  };
  const notice = (
    <>
      {(status.isError || pool?.stale || (issued.isError && !known)) && (
        <div className="nft-launch-error" role="status">
          <span>
            {status.isError
              ? 'Live mint availability could not be refreshed.'
              : issued.isError
                ? 'Ethereum mint identities could not be checked.'
                : 'The index is catching up with Ethereum.'}{' '}
            {status.isError
              ? errorMessage(status.error)
              : issued.isError
                ? errorMessage(issued.error)
                : 'The service has not caught up with the latest block.'}
            {pool && <> Last snapshot: {new Date(pool.asOf).toLocaleTimeString()}.</>}
            {known
              ? ' On-chain mint information is still available.'
              : ' Mint status is still being checked.'}
          </span>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              void status.refetch();
              void issued.refetch();
            }}
            disabled={status.isFetching || issued.isFetching}
          >
            {status.isFetching || issued.isFetching ? 'Refreshing status…' : 'Retry status'}
          </button>
        </div>
      )}
    </>
  );
  const mint = mintById.get(tokenId ?? '');
  const isMinted = mintedIds.has(tokenId ?? '');
  if (tokenId) {
    if (!/^[1-9][0-9]*$/.test(tokenId) || BigInt(tokenId) > BigInt(collection.supply))
      return (
        <EmptyState title="NFT not found">
          This token is outside the collection's edition size.{' '}
          <Link to={nftCollectionPath(collection.pool)}>Back to collection</Link>
        </EmptyState>
      );
    return (
      <>
        <Link
          className="text-link nft-back"
          to={`${nftCollectionPath(collection.pool)}?${params.toString()}`}
        >
          <ArrowLeft size={14} />
          {collection.name}
        </Link>
        {notice}
        <section className="nft-piece-stage" aria-label={`${collection.name} #${tokenId}`}>
          <div className="nft-piece-image">
            <NftArtwork collection={collection} tokenId={tokenId} />
          </div>
          <aside className="nft-piece-copy">
            <span className="eyebrow">{collection.name} / pERC721</span>
            <h1>
              {collection.symbol} #{tokenId}
            </h1>
            <Badge tone={isMinted ? 'green' : 'gray'}>
              {isMinted ? 'Minted' : known ? 'Unminted' : 'Mint status unavailable'}
            </Badge>
            <div className="nft-private-owner">
              <ShieldCheck size={20} />
              <div>
                <strong>Private ownership</strong>
                <p>The holder’s address is hidden.</p>
              </div>
            </div>
            <dl className="nft-launch-facts">
              <div>
                <dt>Note commitment</dt>
                <dd>{mint?.mintCmx ? <CopyValue value={mint.mintCmx} /> : '—'}</dd>
              </div>
              <div>
                <dt>Mint transaction</dt>
                <dd>
                  {mint ? (
                    <a
                      className="text-link mono"
                      href={`https://etherscan.io/tx/${mint.mintTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {short(mint.mintTxHash)} <ExternalLink size={12} />
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div>
                <dt>Collection</dt>
                <dd>
                  <CopyValue value={collection.pool} />
                </dd>
              </div>
              <div>
                <dt>Chain</dt>
                <dd>Ethereum · 1</dd>
              </div>
              <div>
                <dt>Token standard</dt>
                <dd>pERC721</dd>
              </div>
            </dl>
            <p className="muted-text">{manifest.data?.collection.description}</p>
            {!isMinted && phase === 'Live' && (
              <Link className="primary-button" to={nftCollectionPath(collection.pool)}>
                Mint from this collection <ArrowRight size={14} />
              </Link>
            )}
          </aside>
        </section>
      </>
    );
  }
  return (
    <>
      <Link className="text-link nft-back" to="/privasea/launch">
        <ArrowLeft size={14} />
        All launches
      </Link>
      {notice}
      <header className="nft-collection-hero">
        <div className="nft-collection-cover">
          <NftArtwork collection={collection} />
        </div>
        <div className="nft-collection-summary">
          <div className="nft-collection-badges">
            <Badge tone={phase === 'Live' ? 'green' : 'gray'}>{phase}</Badge>
            <span>{saleLabels[collection.saleKind]}</span>
          </div>
          <h1>{collection.name}</h1>
          <p className="muted-text">
            {manifest.data?.collection.description ??
              'Private collectibles on Ethereum. Your art is public. Your ownership stays private.'}
          </p>
          <div className="nft-collection-address">
            <span>{collection.symbol}</span>
            <CopyValue value={collection.pool} />
            <ShieldCheck size={14} />
            pERC721
          </div>
          <dl className="nft-collection-stats">
            <div>
              <dt>Minted</dt>
              <dd>
                {minted.toLocaleString()} <small>/ {collection.supply.toLocaleString()}</small>
              </dd>
            </div>
            <div>
              <dt>Available</dt>
              <dd>{pool?.remaining.toLocaleString() ?? '—'}</dd>
            </div>
            <div>
              <dt>Reserved</dt>
              <dd>{pool?.reserved ?? '—'}</dd>
            </div>
            <div>
              <dt>Mint price</dt>
              <dd>
                {collection.saleKind === 'free'
                  ? 'Free'
                  : `${Number(BigInt(collection.startPriceUnits)) / 1e6} sUSDC`}
              </dd>
            </div>
          </dl>
          <progress
            className="nft-launch-progress"
            value={minted}
            max={collection.supply}
            aria-label={`${collection.name} mint progress`}
          />
        </div>
        <aside className="nft-collection-mint">
          <span className="eyebrow">MINT YOUR PRIVATE NFT</span>
          <h2>{saleLabels[collection.saleKind]}</h2>
          {pool?.whitelist.enabled && <AllocationCheck key={revision} pool={collection.pool} />}
          {collection.saleKind === 'free' ? (
            <MintPanel pool={collection.pool} canMint={phase === 'Live'} onChanged={changed} />
          ) : (
            <p className="muted-text">
              This sale requires a payment flow that is not available in the current wallet.
            </p>
          )}
        </aside>
      </header>
      <div className="nft-collection-tabs">
        <div role="tablist" aria-label="Collection content">
          {['items', 'activity'].map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => update('tab', value)}
            >
              {value === 'items' ? 'Items' : 'Activity'}{' '}
              <span>
                {value === 'items' ? collection.supply.toLocaleString() : (pool?.mints.length ?? 0)}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="text-button"
          disabled={status.isFetching}
          onClick={() => {
            void status.refetch();
            void issued.refetch();
          }}
        >
          <RefreshCw size={14} className={status.isFetching ? 'spin' : ''} />
          Refresh
        </button>
      </div>
      {tab === 'activity' ? (
        <MintActivity pool={pool} collection={collection} />
      ) : (
        <section aria-label="Collection items">
          <div className="nft-launch-toolbar">
            <label className="nft-launch-search">
              <Search size={15} />
              <input
                type="search"
                aria-label="Search token ID"
                placeholder="Search by token number"
                value={search}
                onChange={(event) => update('search', event.target.value)}
              />
            </label>
            <label className="nft-item-filter">
              Status{' '}
              <select
                aria-label="Filter items"
                value={filter}
                onChange={(event) => update('filter', event.target.value)}
              >
                <option value="all">All items</option>
                <option value="minted">Minted</option>
                <option value="unminted" disabled={!known}>
                  Unminted
                </option>
                <option value="listed">Listed</option>
              </select>
            </label>
          </div>
          {ids.length ? (
            <div className="nft-items-grid">
              {ids.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((id) => (
                <Link
                  className="nft-item-card"
                  key={id}
                  to={`${nftCollectionPath(collection.pool, id)}?${params.toString()}`}
                >
                  <div className="nft-item-art">
                    <NftArtwork collection={collection} tokenId={id} />
                  </div>
                  <div className="nft-item-info">
                    <strong>#{id}</strong>
                    <span className={mintedIds.has(id) ? 'text-green' : ''}>
                      {mintedIds.has(id)
                        ? 'Minted'
                        : known
                          ? 'Unminted'
                          : issued.isPending
                            ? 'Checking status'
                            : 'Status unavailable'}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="No matching items">Try another token number or status.</EmptyState>
          )}
          {pages > 1 && (
            <nav className="nft-launch-pagination" aria-label="Collection pages">
              <button
                type="button"
                className="secondary-button"
                disabled={page === 0}
                onClick={() => pageChange(page - 1)}
              >
                <ArrowLeft size={14} />
                Previous
              </button>
              <span aria-live="polite">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, ids.length)} /{' '}
                {ids.length.toLocaleString()}
              </span>
              <button
                type="button"
                className="secondary-button"
                disabled={page + 1 >= pages}
                onClick={() => pageChange(page + 1)}
              >
                Next
                <ArrowRight size={14} />
              </button>
            </nav>
          )}
        </section>
      )}
    </>
  );
}
function MintActivity({ pool, collection }: { pool?: NftPool; collection: NftCollection }) {
  return (
    <section aria-label="Mint activity" className="nft-activity">
      {pool?.mints.length ? (
        [...pool.mints]
          .reverse()
          .slice(0, 100)
          .map((mint) => (
            <div key={mint.tokenId}>
              <Badge tone="green">Mint</Badge>
              <Link to={nftCollectionPath(collection.pool, mint.tokenId)}>
                {collection.symbol} #{mint.tokenId}
              </Link>
              <span className="muted-text">Private holder</span>
              <a
                className="text-link mono"
                href={`https://etherscan.io/tx/${mint.mintTxHash}`}
                target="_blank"
                rel="noreferrer"
              >
                {short(mint.mintTxHash)}
                <ExternalLink size={12} />
              </a>
            </div>
          ))
      ) : (
        <EmptyState title="No mint activity available">
          Confirmed mints appear here as the index updates.
        </EmptyState>
      )}
    </section>
  );
}
export default function NftCollectionPage() {
  const { pool: rawPool = '', tokenId } = useParams();
  const pool = rawPool.toLowerCase();
  const valid = /^0x[0-9a-f]{40}$/.test(pool);
  const collection = useQuery({
    queryKey: ['nft', 'collection', pool],
    queryFn: ({ signal }) => loadNftCollection(pool, signal),
    enabled: valid,
    retry: false,
    staleTime: 30000,
  });
  return (
    <div className="page nft-launch-page">
      <PrivaSeaNav />
      {!valid ? (
        <EmptyState title="Invalid collection address">
          Use a valid Ethereum collection address.
        </EmptyState>
      ) : collection.isPending ? (
        <div className="nft-launch-loading" role="status">
          Loading collection…
        </div>
      ) : collection.isError ? (
        <div className="nft-launch-error" role="alert">
          <span>{errorMessage(collection.error)}</span>
          <button type="button" className="text-button" onClick={() => void collection.refetch()}>
            Retry collection
          </button>
        </div>
      ) : (
        <CollectionView key={pool} collection={collection.data} tokenId={tokenId} />
      )}
    </div>
  );
}
