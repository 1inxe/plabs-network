import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ArrowUpRight, Fingerprint, Gem, LockKeyhole } from 'lucide-react';
import { useEffect, useState } from 'react';
import { platformQueries } from '@/services/platform';
import { unavailableFeatures } from '@/shared/config/product';
import { Badge, Modal, Notice, Panel, Segmented } from '@/shared/ui';
import { WhitelistCheck } from './WhitelistCheck';

const collectibles = [
  {
    id: '0042',
    name: 'Cipher Sovereign',
    type: 'Legendary',
    tone: 'green',
    image: '/assets/nft-0.png',
    description:
      'A passage into the private economy. The Genesis collection explores identity beyond the public ledger.',
  },
  {
    id: '0189',
    name: 'Enclave Relic',
    type: 'Concept',
    tone: 'cyan',
    image: '/assets/nft-1.png',
    description:
      'A study in selective disclosure. Hold your identity close, and choose what the world gets to see.',
  },
  {
    id: '1402',
    name: 'Zero Monolith',
    type: 'Rare',
    tone: 'amber',
    image: '/assets/nft-2.png',
    description:
      'An artifact of the zero-knowledge era. A quiet monument to a world built on mathematical trust.',
  },
];
function remaining(date?: string) {
  if (!date) return '—';
  const delta = Math.max(0, Date.parse(date) - Date.now());
  const hours = Math.floor(delta / 3600000);
  return `${Math.floor(hours / 24)}d ${String(hours % 24).padStart(2, '0')}h ${String(Math.floor(delta / 60000) % 60).padStart(2, '0')}m`;
}
export function CollectiblesPage() {
  const campaign = useQuery(platformQueries.campaign());
  const [tab, setTab] = useState('whitelist'),
    [art, setArt] = useState<(typeof collectibles)[number] | null>(null),
    [countdown, setCountdown] = useState('—');
  useEffect(() => {
    const update = () => setCountdown(remaining(campaign.data?.endsAt));
    update();
    const id = window.setInterval(update, 30000);
    return () => window.clearInterval(id);
  }, [campaign.data?.endsAt]);
  const closed =
    campaign.data?.closed || (campaign.data && Date.parse(campaign.data.endsAt) <= Date.now());
  return (
    <div className="page sea-page">
      <div className="sea-navigation">
        <div className="sea-wordmark">
          <Gem aria-hidden="true" size={22} />
          NFT gallery <span>PLABS COLLECTIONS</span>
        </div>
        <Segmented
          value={tab}
          onChange={setTab}
          items={[
            { value: 'whitelist', label: 'Genesis campaign' },
            { value: 'collection', label: 'The collection' },
            {
              value: 'vault',
              label: 'My NFTs',
              disabled: true,
              reason: unavailableFeatures.nftHoldings,
            },
          ]}
        />
      </div>
      <Notice>
        Whitelist checks are available. Registration, minting and private NFT holdings are not
        available in this app yet.
      </Notice>
      <div hidden={tab !== 'whitelist'}>
        <div className="sea-hero-grid">
          <section className="sea-hero">
            <div className="eyebrow">
              <span className="status-dot" />
              NFT GALLERY / GENESIS
            </div>
            <h1>
              The Genesis collection.
              <br />
              <span>Explore the artwork.</span>
            </h1>
            <p>
              Explore the Genesis collection and check your JubJub Bird and P20 eligibility. Artwork
              previews do not represent assets in your wallet.
            </p>
            <div className="sea-hero-actions">
              <a href="#collection" className="primary-button">
                Explore the collection
                <ArrowRight aria-hidden="true" size={16} />
              </a>
              <button type="submit" form="whitelist-check-form" className="text-link">
                Check whitelist <ArrowUpRight aria-hidden="true" size={14} />
              </button>
            </div>
            <div className="sea-metrics">
              <div>
                <small>ALLOWLIST APPLICATIONS</small>
                <strong>{campaign.data?.applicants.toLocaleString() ?? '—'}</strong>
                <span>Genesis campaign</span>
              </div>
              <div>
                <small>REGISTRATION WINDOW</small>
                <strong className="text-green">
                  {campaign.isError ? 'Unavailable' : closed ? 'Closed' : countdown}
                </strong>
                <span>
                  {campaign.data
                    ? `${new Date(campaign.data.endsAt).toLocaleString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} UTC`
                    : 'Checking campaign status'}
                </span>
              </div>
            </div>
            <div className="hero-orbit" aria-hidden="true">
              <Fingerprint aria-hidden="true" />
              <span />
              <i />
            </div>
          </section>
          <div id="eligibility">
            <Panel className="whitelist-card">
              <div className="panel-heading">
                <h2>
                  <span className="status-dot" />
                  Whitelist eligibility
                </h2>
                <Badge tone={closed ? 'gray' : 'green'}>
                  {campaign.data
                    ? closed
                      ? 'REGISTRATION CLOSED'
                      : 'REGISTRATION OPEN'
                    : 'CHECKING'}
                </Badge>
              </div>
              <WhitelistCheck />
              {campaign.isError && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void campaign.refetch()}
                >
                  Retry campaign status
                </button>
              )}
            </Panel>
          </div>
        </div>
      </div>
      <section id="collection" className="collection-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">THE GENESIS COLLECTION</div>
            <h2>Objects of a private world.</h2>
          </div>
          <Badge tone="gray">DESIGN PREVIEW · NOT A LIVE SALE</Badge>
        </div>
        <div className="nft-grid">
          {collectibles.map((n, i) => (
            <button type="button" className="nft-card" key={n.id} onClick={() => setArt(n)}>
              <div className="nft-art">
                <img src={n.image} alt={`${n.name} — digital collectible concept`} loading="lazy" />
                <div className="nft-art-top">
                  <span>#{n.id} / GENESIS</span>
                  <ArrowUpRight aria-hidden="true" size={17} />
                </div>
                <div className="nft-art-bottom">
                  <LockKeyhole aria-hidden="true" size={12} />
                  OWNERSHIP, REIMAGINED
                </div>
              </div>
              <div className="nft-copy">
                <div>
                  <h3>{n.name}</h3>
                  <Badge tone={n.tone}>{n.type}</Badge>
                </div>
                <p>{n.description}</p>
                <div className="nft-meta">
                  <span>CHAPTER 0{i + 1}</span>
                  <span>
                    Explore artifact <ArrowRight aria-hidden="true" size={14} />
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>
      <Panel className="official-drop">
        <img src="/assets/whitelist-blessing.jpg" alt="PLabs Genesis artwork" loading="lazy" />
        <div>
          <Badge tone="amber">FROM PLABS</Badge>
          <h2>Be part of the beginning.</h2>
          <p>
            Check your Genesis allocation with your privacy wallet. Your JubJub Bird spots and P20
            rewards are available right here.
          </p>
          <button
            type="submit"
            form="whitelist-check-form"
            className="text-link"
            onClick={() => {
              setTab('whitelist');
              window.scrollTo({ top: 0 });
            }}
          >
            Check your eligibility <ArrowUpRight aria-hidden="true" size={14} />
          </button>
        </div>
        <ArrowUpRight aria-hidden="true" size={30} />
      </Panel>
      <Modal
        open={!!art}
        onOpenChange={(open) => !open && setArt(null)}
        title={art?.name ?? 'Collectible'}
        description="Genesis collection concept. This preview does not represent a mint or sale."
      >
        {art && (
          <>
            <img className="collectible-preview" src={art.image} alt={art.name} />
            <div className="panel-heading">
              <span className="mono">#{art.id}</span>
              <Badge tone={art.tone}>{art.type}</Badge>
            </div>
            <p className="muted-text">{art.description}</p>
          </>
        )}
      </Modal>
    </div>
  );
}
