import { useQuery } from '@tanstack/react-query';
import { Gem } from 'lucide-react';
import { platformQueries } from '@/services/platform';
import { Badge, Panel } from '@/shared/ui';
import { WhitelistCheck } from './WhitelistCheck';

export function CollectiblesPage() {
  const campaign = useQuery(platformQueries.campaign());
  const closed =
    campaign.data && (campaign.data.closed || Date.parse(campaign.data.endsAt) <= Date.now());
  return (
    <div className="page sea-page genesis-page">
      <div className="sea-navigation">
        <div className="sea-wordmark">
          <Gem aria-hidden="true" size={22} />
          Genesis whitelist<span>PLABS COLLECTIONS</span>
        </div>
      </div>
      <div className="genesis-grid">
        <section className="genesis-intro">
          <div className="eyebrow">
            <span className="status-dot" />
            THE BEGINNING OF SOMETHING PRIVATE
          </div>
          <h1>Your place in Genesis.</h1>
          <p>
            The first private NFT. The first private token. Check your JubJub Bird whitelist spots
            and P20 allocation.
          </p>
          <img
            className="genesis-art"
            src="/assets/whitelist-blessing.jpg"
            alt="JubJub Bird Genesis artwork"
          />
          <div className="genesis-rewards">
            <div>
              <strong>JubJub Bird</strong>
              <span>Private NFT · pERC721</span>
            </div>
            <div>
              <strong>P20</strong>
              <span>Private token · pERC20</span>
            </div>
          </div>
        </section>
        <Panel className="whitelist-card">
          <div className="panel-heading">
            <h2>
              <span className="status-dot" />
              Check your eligibility
            </h2>
            <Badge tone="green">GENESIS</Badge>
          </div>
          <WhitelistCheck />
          <div className="genesis-campaign">
            <span>
              {campaign.data
                ? `${campaign.data.applicants.toLocaleString()} applications`
                : 'Campaign status unavailable'}
            </span>
            <span>
              {campaign.data
                ? closed
                  ? 'Registration closed · Eligibility checks open'
                  : 'Registration open'
                : ''}
            </span>
            {campaign.isError && (
              <button type="button" className="text-button" onClick={() => void campaign.refetch()}>
                Retry campaign status
              </button>
            )}
          </div>
          <p>
            Confirm the sign-in and privacy ownership requests in your wallet. Checking is free and
            does not create a transaction.
          </p>
        </Panel>
      </div>
    </div>
  );
}
