import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Gem, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { z } from 'zod';
import { useWallet } from '@/features/wallet';
import {
  loadNftCatalog,
  loadNftCollection,
  type NftCollection,
  nftCollectionPath,
} from '@/services/platform/nft-launch';
import { errorMessage } from '@/shared/api/errors';
import { Badge, EmptyState, PageHeading } from '@/shared/ui';
import { mintSchema } from './MintPanel';
import { NftArtwork } from './NftArtwork';
import { PrivaSeaNav } from './PrivaSeaNav';
import { useNftPool } from './useNftPool';
import { useNftWalletCapabilities } from './useNftWalletCapabilities';

const assetSnapshot = z.object({
  chainId: z.literal(1),
  syncedAt: z.number().nullable(),
  syncComplete: z.boolean(),
  error: z.string().optional(),
  progress: z.string().optional(),
  items: z
    .array(
      z.object({
        id: z.string(),
        poolAddress: z.string().regex(/^0x[0-9a-f]{40}$/),
        name: z.string(),
        symbol: z.string(),
        tokenId: z.string().regex(/^[1-9][0-9]*$/),
        state: z.enum(['confirmed', 'pending']),
      }),
    )
    .max(100_000),
});
function CollectionTile({
  collection,
  market = false,
}: {
  collection: NftCollection;
  market?: boolean;
}) {
  const status = useNftPool(collection.pool);
  return (
    <Link className="nft-launch-card nft-hub-card" to={nftCollectionPath(collection.pool)}>
      <div className="nft-launch-art">
        <NftArtwork collection={collection} />
        <span className="nft-launch-art-top">
          <Badge tone="green">pERC721</Badge>
          <ArrowRight size={18} />
        </span>
      </div>
      <div className="nft-launch-card-body">
        <h2>{collection.name}</h2>
        <div className="nft-item-info">
          <span>{collection.symbol}</span>
          <span>
            {market
              ? `${status.data?.listings.length ?? 0} listed`
              : `${(status.data?.minted ?? collection.minted).toLocaleString()} / ${collection.supply.toLocaleString()} minted`}
          </span>
        </div>
      </div>
    </Link>
  );
}
function HoldingCard({
  pool,
  tokenId,
  name,
  state,
}: {
  pool: string;
  tokenId: string;
  name: string;
  state: string;
}) {
  const collection = useQuery({
    queryKey: ['nft', 'collection', pool],
    queryFn: ({ signal }) => loadNftCollection(pool, signal),
    staleTime: 60000,
    retry: false,
  });
  return (
    <Link className="nft-item-card" to={nftCollectionPath(pool, tokenId)}>
      <div className="nft-item-art">
        {collection.data ? (
          <NftArtwork collection={collection.data} tokenId={tokenId} />
        ) : (
          <div className="nft-launch-placeholder">
            <Gem size={28} />
          </div>
        )}
      </div>
      <div className="nft-item-info">
        <strong>
          {name} #{tokenId}
        </strong>
        <span>{state === 'pending' ? 'Pending' : 'Private'}</span>
      </div>
    </Link>
  );
}
function Profile() {
  useNftWalletCapabilities();
  const wallet = useWallet();
  return (
    <ProfileSession
      key={`${wallet.account}:${wallet.chainId}:${wallet.privacyAddress}:${wallet.privacyExpiresAt}:${wallet.privacyScopes.join(',')}`}
      wallet={wallet}
    />
  );
}
function ProfileSession({ wallet }: { wallet: ReturnType<typeof useWallet> }) {
  const [syncing, setSyncing] = useState(false),
    [error, setError] = useState('');
  const active = useRef(true),
    running = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const ready = !!wallet.account && wallet.chainId === 1 && !!wallet.privacyAddress;
  const supported = wallet.capabilities?.methods.nftAssets === true;
  const allowed = ready && supported && wallet.privacyScopes.includes('nfts');
  const contextCheck = async () => {
    const session = await wallet.wallet?.session();
    if (
      session?.accounts[0]?.toLowerCase() !== wallet.account.toLowerCase() ||
      session.chainId !== 1 ||
      session.privacy?.address !== wallet.privacyAddress ||
      !session.privacy.scopes.includes('nfts')
    )
      throw new Error('Your wallet or NFT read permission changed. Reconnect to continue.');
  };
  const assets = useQuery({
    queryKey: [
      'nft',
      'holdings',
      wallet.account,
      wallet.chainId,
      wallet.privacyAddress,
      wallet.privacyExpiresAt,
    ],
    enabled: allowed,
    gcTime: 0,
    retry: false,
    refetchInterval: 10000,
    queryFn: async () => {
      await contextCheck();
      const data = assetSnapshot.parse(await wallet.wallet?.nftAssets?.());
      await contextCheck();
      return data;
    },
  });
  const mints = useQuery({
    queryKey: [
      'nft',
      'my-mints',
      wallet.account,
      wallet.chainId,
      wallet.privacyAddress,
      wallet.privacyExpiresAt,
    ],
    enabled: ready && wallet.capabilities?.methods.nftMinting === true,
    gcTime: 0,
    retry: false,
    refetchInterval: 6000,
    queryFn: async () => z.array(mintSchema).parse(await wallet.wallet?.nftMints?.()),
  });
  const authorize = async () => {
    setError('');
    try {
      if (!wallet.account) {
        wallet.setModal(true);
        return;
      }
      if (wallet.chainId !== 1) {
        await wallet.switchChain(1);
        return;
      }
      await wallet.authorizeRead(['address', 'nfts']);
    } catch (cause) {
      if (active.current) setError(errorMessage(cause));
    }
  };
  const sync = async () => {
    if (running.current) return;
    running.current = true;
    setSyncing(true);
    setError('');
    try {
      await contextCheck();
      assetSnapshot.parse(await wallet.wallet?.nftAssets?.({ sync: true }));
      await contextCheck();
      if (active.current) await assets.refetch();
    } catch (cause) {
      if (active.current) setError(errorMessage(cause));
    } finally {
      running.current = false;
      if (active.current) setSyncing(false);
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="YOUR PRIVATE COLLECTION"
        title="Your NFTs. Your privacy."
        description="View the private NFTs held by your connected wallet, including received items and mints from other sites."
        action={
          allowed ? (
            <button
              type="button"
              className="secondary-button"
              disabled={syncing}
              onClick={() => void sync()}
            >
              <RefreshCw size={14} className={syncing ? 'spin' : ''} />
              {syncing ? 'Syncing NFTs…' : 'Sync wallet NFTs'}
            </button>
          ) : undefined
        }
      />
      {!allowed && (
        <div className="nft-profile-consent">
          <LockKeyhole size={32} />
          <h2>Unlock your private collection</h2>
          <p className="muted-text">
            Share NFT collection names, token numbers and holding status with this site. Your wallet
            keeps all viewing keys, spending keys and private Note openings.
          </p>
          {wallet.account && !supported ? (
            <p className="muted-text">Update and reload PLabs Wallet to share NFT holdings.</p>
          ) : (
            <button
              className="primary-button"
              type="button"
              disabled={wallet.busy}
              onClick={() => void authorize()}
            >
              {!wallet.account
                ? 'Connect wallet'
                : wallet.chainId !== 1
                  ? 'Switch to Ethereum'
                  : 'Allow NFT access'}
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}
      {(error || assets.error || assets.data?.error || wallet.readAuthorizationError) && (
        <p className="nft-launch-error" role="alert">
          {error ||
            (assets.error ? errorMessage(assets.error) : assets.data?.error) ||
            wallet.readAuthorizationError}
        </p>
      )}
      {allowed && (
        <section aria-label="My private NFTs">
          {assets.isPending ? (
            <div className="nft-launch-loading" role="status">
              Reading wallet NFTs…
            </div>
          ) : assets.data?.items.length ? (
            <div className="nft-items-grid">
              {assets.data.items.map((item) => (
                <HoldingCard
                  key={item.id}
                  pool={item.poolAddress}
                  tokenId={item.tokenId}
                  name={item.name}
                  state={item.state}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title={
                assets.data?.syncComplete ? 'No NFTs held by this wallet' : 'NFT scan not complete'
              }
            >
              {assets.data?.syncComplete
                ? 'Mint from Launch to start your collection.'
                : 'Sync your wallet to discover received NFTs and check spent Notes.'}
              <Link className="text-link" to="/privasea/launch">
                Explore launches
                <ArrowRight size={14} />
              </Link>
            </EmptyState>
          )}
          {assets.data && (
            <p className="muted-text nft-sync-status" role="status">
              {assets.data.progress ||
                (assets.data.syncComplete
                  ? 'Wallet scan complete.'
                  : 'Partial wallet snapshot. Sync to check your latest holdings.')}
              {assets.data.syncedAt
                ? ` Last full sync: ${new Date(assets.data.syncedAt).toLocaleString()}.`
                : ''}
            </p>
          )}
        </section>
      )}
      {ready && wallet.capabilities?.methods.nftMinting === true && (
        <section className="nft-profile-history" aria-label="My mint requests">
          <h2>Mint requests from this site</h2>
          {mints.isError ? (
            <p className="nft-launch-error">{errorMessage(mints.error)}</p>
          ) : mints.data?.length ? (
            <div className="nft-activity">
              {[...mints.data]
                .sort((a, b) => b.createdAt - a.createdAt)
                .map((row) => (
                  <div key={row.id}>
                    <Badge tone={row.state === 'confirmed' ? 'green' : 'gray'}>{row.state}</Badge>
                    <Link
                      to={nftCollectionPath(
                        row.poolAddress,
                        row.state === 'confirmed' ? row.tokenId : undefined,
                      )}
                    >
                      {row.name}
                      {row.tokenId ? ` #${row.tokenId}` : ''}
                    </Link>
                    <span className="muted-text">
                      {row.canResume ? 'Open collection to resume' : row.stage}
                    </span>
                  </div>
                ))}
            </div>
          ) : (
            <p className="muted-text">
              {mints.isPending
                ? 'Reading saved mint requests…'
                : 'No mint requests from this site yet.'}
            </p>
          )}
        </section>
      )}
    </>
  );
}
export default function NftHubPage() {
  const path = useLocation().pathname;
  const profile = path.endsWith('/profile'),
    create = path.endsWith('/create'),
    market = path.endsWith('/market');
  const [offset, setOffset] = useState(0);
  const catalog = useQuery({
    queryKey: ['nft', 'catalog', offset],
    queryFn: ({ signal }) => loadNftCatalog(signal, offset),
    enabled: !profile && !create,
    retry: false,
    staleTime: 30000,
  });
  return (
    <div className="page nft-launch-page">
      <PrivaSeaNav />
      {profile ? (
        <Profile />
      ) : create ? (
        <>
          <PageHeading
            eyebrow="COLLECTION STUDIO"
            title="Create a private collection."
            description="Launch your art with private ownership on Ethereum."
          />
          <div className="nft-profile-consent">
            <Gem size={36} />
            <Badge tone="gray">NOT OPEN YET</Badge>
            <h2>Collection creation is not open on mainnet.</h2>
            <p className="muted-text">
              The production protocol currently disables public collection creation. Existing
              collections and free mints are available here.
            </p>
            <Link className="primary-button" to="/privasea/launch">
              Explore launches
              <ArrowRight size={14} />
            </Link>
          </div>
        </>
      ) : (
        <>
          {market ? (
            <PageHeading
              eyebrow="PRIVATE NFT MARKET"
              title="Discover the collection."
              description="Explore verified private NFT collections and their public artwork. Secondary trading is not open in the production protocol."
            />
          ) : (
            <section className="nft-home-hero">
              <div>
                <span className="eyebrow">PRIVASEA / ETHEREUM</span>
                <h1>
                  Art for everyone.
                  <br />
                  <em>Ownership for you.</em>
                </h1>
                <p>
                  Discover, mint and collect private NFTs. Public art. Private holders. Powered by
                  pERC721.
                </p>
                <div className="nft-home-actions">
                  <Link className="primary-button" to="/privasea/launch">
                    Explore launches
                    <ArrowRight size={15} />
                  </Link>
                  <Link className="secondary-button" to="/privasea/profile">
                    My collection
                  </Link>
                </div>
                <span className="nft-home-assurance">
                  <ShieldCheck size={15} />
                  Your wallet keeps the keys to your collection.
                </span>
              </div>
              <div className="nft-home-art">
                {catalog.data?.collections[0] ? (
                  <Link to={nftCollectionPath(catalog.data.collections[0].pool)}>
                    <NftArtwork collection={catalog.data.collections[0]} />
                    <span>
                      {catalog.data.collections[0].name}
                      <ArrowRight size={16} />
                    </span>
                  </Link>
                ) : (
                  <div className="nft-launch-placeholder">
                    <Gem size={64} />
                  </div>
                )}
              </div>
            </section>
          )}
          <div className="nft-launch-toolbar">
            <div>
              <span className="status-dot" />
              <strong>{market ? 'Collections' : 'Explore private drops'}</strong>
              <span>Collections on this page: {catalog.data?.collections.length ?? '—'}</span>
            </div>
            <Link className="text-link" to="/privasea/launch">
              All launches
              <ArrowRight size={14} />
            </Link>
          </div>
          {catalog.isError ? (
            <div className="nft-launch-error" role="alert">
              {errorMessage(catalog.error)}
              <button type="button" className="text-button" onClick={() => void catalog.refetch()}>
                Retry collections
              </button>
            </div>
          ) : catalog.isPending ? (
            <div className="nft-launch-loading" role="status">
              Loading collections…
            </div>
          ) : catalog.data.collections.length ? (
            <section className="nft-launch-grid" aria-label="NFT collections">
              {catalog.data.collections.map((collection) => (
                <CollectionTile key={collection.pool} collection={collection} market={market} />
              ))}
            </section>
          ) : (
            <EmptyState title="No collections yet">
              New collections will appear here when they launch.
            </EmptyState>
          )}
          {catalog.data && catalog.data.total > 12 && (
            <nav className="nft-launch-pagination" aria-label="Catalog pages">
              <button
                type="button"
                className="secondary-button"
                disabled={offset === 0 || catalog.isFetching}
                onClick={() => setOffset(Math.max(0, offset - 12))}
              >
                Previous
              </button>
              <span>Page {offset / 12 + 1}</span>
              <button
                type="button"
                className="secondary-button"
                disabled={offset + 12 >= catalog.data.total || catalog.isFetching}
                onClick={() => setOffset(offset + 12)}
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
