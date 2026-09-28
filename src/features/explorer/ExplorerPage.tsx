import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Network, Search, Shield, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useWallet } from '@/features/wallet';
import type { IndexerNetwork } from '@/services/indexer';
import { indexerQueries } from '@/services/indexer';
import { platformQueries } from '@/services/platform';
import { formatRaw, short } from '@/shared/lib/format';
import {
  Badge,
  CopyButton,
  ExternalLink,
  Notice,
  PageHeading,
  Panel,
  Segmented,
} from '@/shared/ui';
import { PublicLedger } from './PublicLedger';

const scan = (chain: number) =>
  chain === 1 ? 'https://etherscan.io' : chain === 143 ? 'https://monadscan.com' : null;
export function Explorer() {
  const [params, setParams] = useSearchParams(),
    [chain, setChain] = useState<IndexerNetwork>('monad'),
    [query, setQuery] = useState(params.get('q') || '');
  const searched = params.get('q') ?? '';
  useEffect(() => setQuery(params.get('q') ?? ''), [params]);
  const w = useWallet();
  const users = useQuery(platformQueries.users()),
    transactions = useQuery(indexerQueries.statistics(chain));
  const poolStats = useQuery(indexerQueries.pools(chain));
  const pools = poolStats.data ?? [];
  const valid = /^0x(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(searched);
  const search = () => {
    setParams(query.trim() ? { q: query.trim() } : {});
  };
  return (
    <div className="page">
      <PageHeading
        eyebrow="PUBLIC DATA. PRIVATE IDENTITIES."
        title="Privacy Pool Explorer"
        description="Explore the network. Verify activity without compromising privacy."
        action={
          <Segmented
            value={chain}
            onChange={(v) => setChain(v as IndexerNetwork)}
            items={[
              { value: 'monad', label: 'Monad' },
              { value: 'ethereum', label: 'Ethereum' },
            ]}
          />
        }
      />
      <div className="stats-grid">
        <Panel className="stat-card">
          <div>
            Privacy wallet users
            <Users aria-hidden="true" size={19} />
          </div>
          <strong>{users.data?.users.toLocaleString() ?? '—'}</strong>
          <small>
            <span className={`status-dot ${users.isError ? 'muted' : ''}`} />
            {users.isError ? 'Service unavailable' : 'PLabs platform · all networks'}
          </small>
          {users.isError && (
            <button type="button" className="text-button" onClick={() => void users.refetch()}>
              Retry
            </button>
          )}
        </Panel>
        <Panel className="stat-card">
          <div>
            Shielded transactions
            <Shield aria-hidden="true" size={19} />
          </div>
          <strong>{transactions.data?.totalTransactions.toLocaleString() ?? '—'}</strong>
          <small>
            <Badge>{chain === 'monad' ? 'Monad' : 'Ethereum'}</Badge>Public indexer
          </small>
          {transactions.isError && (
            <button
              type="button"
              className="text-button"
              onClick={() => void transactions.refetch()}
            >
              Service unavailable · Retry
            </button>
          )}
        </Panel>
        <Panel className="stat-card">
          <div>
            Indexed asset pools
            <Network aria-hidden="true" size={19} />
          </div>
          <strong>
            {poolStats.data ? pools.length : '—'}
            <span> pools</span>
          </strong>
          <small>
            {w.wallet
              ? 'From your extension capabilities'
              : 'Connect PLabs Wallet to discover pools'}
          </small>
        </Panel>
      </div>
      <div className="section-heading">
        <h2>Shielded Liquidity Pools</h2>
        <Badge tone="gray">{chain === 'monad' ? 'MONAD' : 'ETHEREUM'} NETWORK</Badge>
      </div>
      <div className="pool-grid">
        {pools.map((pool) => (
          <Panel className="pool-card" key={pool.address}>
            <div className="panel-heading">
              <h2>
                <span className="coin green">
                  {pool.symbol.includes('USD') ? '$' : pool.symbol.slice(0, 1)}
                </span>
                {pool.symbol} Pool
              </h2>
              <Badge tone="gray">{pool.type}</Badge>
            </div>
            <div className="pool-address mono">
              {short(pool.address)}
              <CopyButton value={pool.address} />
            </div>
            <p>
              {pool.type === 'wrapped'
                ? `Net shielded: ${formatRaw(pool.netShieldedRaw, pool.decimals)} ${pool.symbol}`
                : 'Native private issuance · supply is not a public shielded-deposit balance'}
            </p>
            <Link className="text-link" to="/assets">
              Open gateway
              <ArrowUpRight size={14} />
            </Link>
          </Panel>
        ))}
      </div>
      {poolStats.isError && (
        <Notice>
          Pool statistics are unavailable from the official indexer.{' '}
          <button type="button" className="text-button" onClick={() => void poolStats.refetch()}>
            Retry
          </button>
        </Notice>
      )}
      <Panel className="explorer-search">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <Search aria-hidden="true" size={21} />
          <input
            aria-label="Explorer search"
            placeholder="Search a transaction hash or public EVM address…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="primary-button" type="submit">
            Search
            <ArrowRightIcon />
          </button>
        </form>
        <div className="search-hints">
          <span>
            <Shield aria-hidden="true" size={12} />
            No private keys. No viewing keys.
          </span>
          <span>{chain === 'monad' ? 'Monad Mainnet' : 'Ethereum Mainnet'}</span>
        </div>
      </Panel>
      {searched && (
        <Panel className="search-result">
          <h2>Search result</h2>
          {valid ? (
            <>
              <p className="mono break-all">{searched}</p>
              <Notice>
                Inspect public on-chain data with the network explorer. Private note contents are
                not exposed.
              </Notice>
              <ExternalLink
                href={`${scan(chain === 'monad' ? 143 : 1)}/${searched.length === 66 ? 'tx' : 'address'}/${searched}`}
              >
                Open in {chain === 'monad' ? 'Monadscan' : 'Etherscan'}
              </ExternalLink>
            </>
          ) : (
            <Notice>
              Enter a complete 0x transaction hash (64 hex characters) or public address (40 hex
              characters). Private notes can only be inspected in your wallet.
            </Notice>
          )}
        </Panel>
      )}
      <PublicLedger network={chain} hash={searched} />
      <div className="prover-banner">
        <div className="empty-icon">
          <Shield aria-hidden="true" size={24} />
        </div>
        <div>
          <h3>Proofs belong in your wallet.</h3>
          <p>
            PLabs Wallet manages proving, private notes and transaction approval. This application
            never syncs a browser vault.
          </p>
        </div>
        <button type="button" className="secondary-button" onClick={() => void w.open()}>
          Open PLabs Wallet
          <ArrowUpRight aria-hidden="true" size={15} />
        </button>
      </div>
    </div>
  );
}
function ArrowRightIcon() {
  return <ArrowUpRight aria-hidden="true" size={15} />;
}
