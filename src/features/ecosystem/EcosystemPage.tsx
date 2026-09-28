import { ArrowRight, LockKeyhole, Rocket } from 'lucide-react';
import { Link } from 'react-router-dom';
import { unavailableFeatures } from '@/shared/config/product';
import { Badge, PageHeading, Panel } from '@/shared/ui';

export function EcosystemPage() {
  return (
    <div className="page">
      <PageHeading
        eyebrow="DISCOVER"
        title="Token launch"
        description="Create and launch a token on PLabs when this feature becomes available."
      />
      <Panel className="feature-unavailable">
        <span className="feature-unavailable-icon">
          <Rocket aria-hidden="true" size={28} />
        </span>
        <Badge tone="gray">NOT AVAILABLE</Badge>
        <h2>Token creation is not enabled</h2>
        <p>
          {unavailableFeatures.tokenLaunch} You can manage assets and use spot trading from the
          workspace.
        </p>
        <button type="button" className="primary-button" disabled>
          <LockKeyhole aria-hidden="true" size={15} />
          Create token
        </button>
        <Link className="text-link" to="/assets">
          Go to assets <ArrowRight aria-hidden="true" size={14} />
        </Link>
      </Panel>
    </div>
  );
}
