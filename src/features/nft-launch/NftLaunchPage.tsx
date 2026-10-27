import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, ArrowUpRight, Gem, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createNftLaunchService,
  loadNftArtwork,
  loadNftCatalog,
  NFT_PAGE_SIZE,
  type NftCollection,
  nftPhase,
  officialNftCollectionUrl,
} from '@/services/platform/nft-launch';
import { errorMessage } from '@/shared/api/errors';
import { apiEndpoints } from '@/shared/config/env';
import { short } from '@/shared/lib/format';
import { Badge, EmptyState, Modal, PageHeading } from '@/shared/ui';
import { AllocationCheck } from './AllocationCheck';
import { MintPanel } from './MintPanel';

const service = createNftLaunchService(apiEndpoints.nft);
const sales = {
  free: 'Free mint',
  fixed: 'Fixed price',
  english: 'English auction',
  privacy: 'Privacy auction',
};
function Artwork({ collection }: { collection: NftCollection }) {
  const artwork = useQuery({
    queryKey: ['nft', 'artwork', collection.pool, collection.metadataManifestHash],
    queryFn: ({ signal }) => loadNftArtwork(collection, signal),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!artwork.data) return;
    const objectUrl = URL.createObjectURL(artwork.data.image);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [artwork.data]);
  return url ? (
    <img src={url} alt={`${collection.name} collection artwork`} />
  ) : (
    <div className="nft-launch-placeholder">
      <Gem aria-hidden="true" size={42} />
      <span>{artwork.isPending ? 'Loading artwork…' : 'Artwork unavailable'}</span>
    </div>
  );
}
function CollectionCard({ collection, now }: { collection: NftCollection; now: number }) {
  const [details, setDetails] = useState(false);
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
      <button
        type="button"
        className="nft-launch-art"
        onClick={() => setDetails(true)}
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
      </button>
      <div className="nft-launch-card-body">
        <div className="nft-launch-title">
          <h2>
            <button type="button" onClick={() => setDetails(true)}>
              {collection.name}
            </button>
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
        <a
          className="text-link"
          href={officialNftCollectionUrl(collection.pool)}
          target="_blank"
          rel="noreferrer"
        >
          {collection.saleKind === 'free'
            ? 'View on PLabs'
            : live
              ? collection.saleKind === 'fixed'
                ? 'Mint on PLabs'
                : 'Bid on PLabs'
              : 'View on PLabs'}
          <ArrowUpRight aria-hidden="true" size={15} />
        </a>
        {live && collection.saleKind !== 'free' && (
          <p className="nft-launch-handoff">Continue in PLabs with the same privacy wallet.</p>
        )}
      </div>
      <Modal
        open={details}
        onOpenChange={setDetails}
        title={collection.name}
        description={`${sales[collection.saleKind]} · Private NFT collection on Ethereum`}
      >
        <div className="nft-launch-detail-art">
          <Artwork collection={collection} />
        </div>
        <dl className="nft-launch-facts">
          <div>
            <dt>Symbol</dt>
            <dd>{collection.symbol}</dd>
          </div>
          <div>
            <dt>Sale</dt>
            <dd>{sales[collection.saleKind]}</dd>
          </div>
          <div>
            <dt>Minted</dt>
            <dd>
              {minted} / {supply}
            </dd>
          </div>
          <div>
            <dt>Creator</dt>
            <dd>
              <a
                className="text-link mono"
                href={`https://etherscan.io/address/${collection.creator}`}
                target="_blank"
                rel="noreferrer"
              >
                {short(collection.creator)} ↗
              </a>
            </dd>
          </div>
          <div>
            <dt>Collection</dt>
            <dd>
              <a
                className="text-link mono"
                href={`https://etherscan.io/address/${collection.pool}`}
                target="_blank"
                rel="noreferrer"
              >
                {short(collection.pool)} ↗
              </a>
            </dd>
          </div>
        </dl>
        <a
          className="primary-button"
          href={officialNftCollectionUrl(collection.pool)}
          target="_blank"
          rel="noreferrer"
        >
          Open collection on PLabs <ArrowUpRight aria-hidden="true" size={15} />
        </a>
      </Modal>
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
      <div className="sea-navigation">
        <div className="sea-wordmark">
          <Gem aria-hidden="true" size={22} />
          PrivaSea <span>PRIVATE NFTS</span>
        </div>
        <Badge tone="green">NFT LAUNCH</Badge>
      </div>
      <nav className="nft-launch-navigation" aria-label="PrivaSea navigation">
        <Link to="/p-sea">Genesis whitelist</Link>
        <Link to="/privasea/jubjub">JubJub auction</Link>
        <a href="https://app.plabs.online/privasea/market" target="_blank" rel="noreferrer">
          NFT market <ArrowUpRight aria-hidden="true" size={12} />
        </a>
        <a href="https://app.plabs.online/privasea/create" target="_blank" rel="noreferrer">
          Create collection <ArrowUpRight aria-hidden="true" size={12} />
        </a>
        <a href="https://app.plabs.online/privasea/profile" target="_blank" rel="noreferrer">
          My NFTs <ArrowUpRight aria-hidden="true" size={12} />
        </a>
      </nav>
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
              ? `${catalog.data.total} ${catalog.data.total === 1 ? 'collection' : 'collections'}`
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
