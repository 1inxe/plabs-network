import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, ArrowUpRight, Gem, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createNftLaunchService,
  loadNftCatalog,
  NFT_PAGE_SIZE,
  type NftCollection,
  nftCollectionPath,
  nftPhase,
} from '@/services/platform/nft-launch';
import { errorMessage } from '@/shared/api/errors';
import { apiEndpoints } from '@/shared/config/env';
import { Badge, EmptyState, PageHeading } from '@/shared/ui';
import { AllocationCheck } from './AllocationCheck';
import { MintPanel } from './MintPanel';
import { NftArtwork as Artwork } from './NftArtwork';
import { PrivaSeaNav } from './PrivaSeaNav';

const service = createNftLaunchService(apiEndpoints.nft);
const sales = {
  free: 'Free mint',
  fixed: 'Fixed price',
  english: 'English auction',
  privacy: 'Privacy auction',
};
function CollectionCard({ collection, now }: { collection: NftCollection; now: number }) {
  const [allocationRevision, setAllocationRevision] = useState(0);
  const mintChanged = useCallback(() => setAllocationRevision((value) => value + 1), []);
  const status = useQuery({
    queryKey: ['nft', 'pool', collection.pool],
    queryFn: ({ signal }) => service.pool(collection.pool, signal),
    refetchInterval: 10000,
    retry: false,
  });
  const data = status.data;
  const phase = nftPhase(collection, data, now);
  const minted = data?.minted ?? collection.minted;
  const supply = data?.supply ?? collection.supply;
  const live = phase === 'Live';
  const unavailable = status.isError || data?.stale;
  const latest = data
    ? new Date(data.asOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  return (
    <article className="nft-launch-card">
      <Link
        to={nftCollectionPath(collection.pool)}
        className="nft-launch-art"
        aria-label={`View ${collection.name}`}
      >
        <Artwork collection={collection} />
        <span className="nft-launch-art-top">
          <Badge tone={live ? 'green' : 'gray'}>{phase.toUpperCase()}</Badge>
          <ArrowUpRight aria-hidden="true" size={18} />
        </span>
        <span className="nft-launch-art-bottom">
          {collection.symbol} <span>pERC721 / ETHEREUM</span>
        </span>
      </Link>
      <div className="nft-launch-card-body">
        <div className="nft-launch-title">
          <h2>
            <Link to={nftCollectionPath(collection.pool)}>{collection.name}</Link>
          </h2>
          <Badge tone="gray">{sales[collection.saleKind]}</Badge>
        </div>
        <div className="nft-launch-progress-heading">
          <span>Minted</span>
          <strong>
            {minted.toLocaleString()} <span>/ {supply.toLocaleString()}</span>
          </strong>
        </div>
        <progress
          className="nft-launch-progress"
          value={minted}
          max={supply}
          aria-label={`${collection.name} mint progress`}
        />
        <div className="nft-launch-update" role="status">
          {unavailable ? (
            <>
              <span>
                Live status unavailable
                {data ? ` · last update ${latest}` : ' · showing on-chain snapshot'}
              </span>
              <button
                type="button"
                onClick={() => void status.refetch()}
                disabled={status.isFetching}
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <span>
                {data
                  ? `${data.remaining} remaining${data.reserved ? ` · ${data.reserved} reserved` : ''}`
                  : 'Checking live status…'}
              </span>
              {latest && <span>Updated {latest}</span>}
            </>
          )}
        </div>
        {phase === 'Upcoming' && (
          <p className="muted-text">Starts {new Date(collection.startedAt).toLocaleString()}</p>
        )}
        {live && data?.whitelist.enabled && (
          <AllocationCheck key={allocationRevision} pool={collection.pool} />
        )}
        {collection.saleKind === 'free' && (
          <MintPanel pool={collection.pool} canMint={live} onChanged={mintChanged} />
        )}
        <Link className="text-link" to={nftCollectionPath(collection.pool)}>
          View collection <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

export function NftLaunchPage() {
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(Date.now);
  const catalog = useQuery({
    queryKey: ['nft', 'catalog', offset],
    queryFn: ({ signal }) => loadNftCatalog(signal, offset),
    staleTime: 30000,
    refetchInterval: 60000,
    retry: false,
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const query = search.trim().toLowerCase();
  const collections =
    catalog.data?.collections.filter((collection) =>
      `${collection.name} ${collection.symbol} ${collection.pool}`.toLowerCase().includes(query),
    ) ?? [];
  return (
    <div className="page nft-launch-page">
      <PrivaSeaNav />
      <PageHeading
        eyebrow="NFT LAUNCH / ETHEREUM"
        title="A new chapter in private ownership."
        description="Explore private NFT drops, check your allocation, and mint directly with PLabs Wallet."
        action={
          <button
            type="button"
            className="secondary-button"
            disabled={catalog.isFetching}
            onClick={() => void catalog.refetch()}
          >
            <RefreshCw aria-hidden="true" size={14} className={catalog.isFetching ? 'spin' : ''} />
            {catalog.isFetching ? 'Refreshing…' : 'Refresh collections'}
          </button>
        }
      />
      <div className="nft-launch-toolbar">
        <div>
          <span className="status-dot" />
          <strong>All launches</strong>
          <span>
            {catalog.data
              ? `${collections.length} ${collections.length === 1 ? 'collection' : 'collections'} on this page`
              : 'Reading on-chain catalog'}
          </span>
        </div>
        <label className="nft-launch-search">
          <Search aria-hidden="true" size={15} />
          <input
            type="search"
            aria-label="Search NFT collections"
            placeholder="Name, symbol, or collection address"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      {catalog.isError && (
        <div className="nft-launch-error" role="alert">
          <span>
            {errorMessage(catalog.error)}
            {catalog.data && ' Showing the last available catalog.'}
          </span>
          <button type="button" className="text-button" onClick={() => void catalog.refetch()}>
            Retry collections
          </button>
        </div>
      )}
      {catalog.isPending ? (
        <div className="nft-launch-loading" role="status">
          <Gem aria-hidden="true" size={32} />
          <p>Loading NFT launches…</p>
        </div>
      ) : collections.length ? (
        <section
          className="nft-launch-grid"
          aria-label="NFT launches"
          aria-busy={catalog.isPlaceholderData}
        >
          {collections.map((collection) => (
            <CollectionCard key={collection.pool} collection={collection} now={now} />
          ))}
        </section>
      ) : (
        !catalog.isError && (
          <EmptyState title={query ? 'No matching collections' : 'No NFT launches yet'}>
            {query
              ? 'Try another name, symbol, or collection address.'
              : 'New collections will appear here as they launch.'}
          </EmptyState>
        )
      )}
      {catalog.data && catalog.data.total > NFT_PAGE_SIZE && (
        <div className="nft-launch-pagination">
          <button
            type="button"
            className="secondary-button"
            disabled={offset === 0 || catalog.isFetching}
            onClick={() => setOffset(Math.max(0, offset - NFT_PAGE_SIZE))}
          >
            <ArrowLeft size={14} />
            Previous
          </button>
          <span>
            Page {Math.floor(offset / NFT_PAGE_SIZE) + 1} of{' '}
            {Math.ceil(catalog.data.total / NFT_PAGE_SIZE)} · Search this page
          </span>
          <button
            type="button"
            className="secondary-button"
            disabled={offset + NFT_PAGE_SIZE >= catalog.data.total || catalog.isFetching}
            onClick={() => setOffset(offset + NFT_PAGE_SIZE)}
          >
            Next
            <ArrowRight size={14} />
          </button>
        </div>
      )}
      <div className="nft-launch-notes">
        <div>
          <span className="eyebrow">YOUR PRIVACY WALLET</span>
          <h2>Your allocation travels with you.</h2>
          <p>
            Check allocation and mint with your connected PLabs Wallet. Your private NFTs appear in
            the wallet after synchronization.
          </p>
        </div>
        <div>
          <span className="eyebrow">ON ETHEREUM</span>
          <h2>Live drops. Clear progress.</h2>
          <p>
            Collection details come from the Ethereum catalog. Mint counts refresh automatically. A
            free mint has no sale price; network fees may still apply.
          </p>
        </div>
      </div>
    </div>
  );
}
