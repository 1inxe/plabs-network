import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ArrowUpRight, Fingerprint } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PrivaSeaNav } from '@/features/nft-launch/PrivaSeaNav';
import { platformQueries } from '@/services/platform';
import { Badge, Notice, Panel } from '@/shared/ui';
import { WhitelistCheck } from './WhitelistCheck';

function remaining(date?: string) {
  if (!date) return '—';
  const delta = Math.max(0, Date.parse(date) - Date.now());
  const hours = Math.floor(delta / 3600000);
  return `${Math.floor(hours / 24)}d ${String(hours % 24).padStart(2, '0')}h ${String(Math.floor(delta / 60000) % 60).padStart(2, '0')}m`;
}
export function CollectiblesPage() {
  const campaign = useQuery(platformQueries.campaign());
  const [countdown, setCountdown] = useState('—');
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
      <PrivaSeaNav />
      <Notice>
        Private NFT launches are now available.{' '}
        <Link className="text-link" to="/privasea/launch">
          Explore NFT Launch →
        </Link>{' '}
        or{' '}
        <Link className="text-link" to="/privasea/jubjub">
          review the JubJub auction →
        </Link>{' '}
        You can also check your Genesis whitelist below.
      </Notice>
      <div>
        <div className="sea-hero-grid">
          <section className="sea-hero">
            <div className="eyebrow">
              <span className="status-dot" />
              NFT GALLERY / GENESIS
            </div>
            <h1>
              Your Genesis allocation.
              <br />
              <span>Check your eligibility.</span>
            </h1>
            <p>Check your JubJub Bird spots and P20 eligibility with your privacy wallet.</p>
            <div className="sea-hero-actions">
              <Link to="/privasea/launch" className="primary-button">
                Explore NFT launches
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
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
    </div>
  );
}
