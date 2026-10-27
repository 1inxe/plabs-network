import { Gem } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { Badge } from '@/shared/ui';

export function PrivaSeaNav() {
  return (
    <>
      <div className="sea-navigation">
        <NavLink className="sea-wordmark" to="/privasea" end>
          <Gem size={22} aria-hidden="true" />
          PrivaSea <span>PRIVATE NFTS</span>
        </NavLink>
        <Badge tone="green">ETHEREUM · pERC721</Badge>
      </div>
      <nav className="nft-launch-navigation" aria-label="PrivaSea navigation">
        {(
          [
            ['/privasea', 'Home'],
            ['/privasea/launch', 'Launch'],
            ['/privasea/market', 'Market'],
            ['/privasea/create', 'Create'],
            ['/privasea/jubjub', 'JubJub'],
            ['/privasea/whitelist', 'Whitelist'],
            ['/privasea/profile', 'Profile'],
          ] as const
        ).map(([path, label]) => (
          <NavLink key={path} to={path} end>
            {label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
