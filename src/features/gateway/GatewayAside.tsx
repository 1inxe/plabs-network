import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  CircleHelp,
  Send,
  Wallet,
} from 'lucide-react';
import { useWallet } from '@/features/wallet';
import { Panel } from '@/shared/ui';

export function GatewayAside() {
  const wallet = useWallet();
  return (
    <aside className="gateway-aside">
      <Panel className="asset-guide">
        <div id="lifecycle" className="panel-heading">
          <h2>
            <CircleHelp aria-hidden="true" size={17} />
            How assets move
          </h2>
        </div>
        {[
          {
            label: 'Deposit',
            route: 'Public → Private',
            description: 'Also called shielding. Move supported public tokens into a privacy pool.',
            Icon: ArrowDownToLine,
          },
          {
            label: 'Private transfer',
            route: 'Private → Private',
            description: 'Send to a perc1 address. Your wallet confirms the recipient and fee.',
            Icon: Send,
          },
          {
            label: 'Withdraw',
            route: 'Private → Public',
            description: 'Also called unshielding. Return assets to your public wallet.',
            Icon: ArrowUpFromLine,
          },
        ].map(({ label, route, description, Icon }) => (
          <div className="asset-guide-step" key={label}>
            <span className="asset-guide-icon">
              <Icon aria-hidden="true" size={16} />
            </span>
            <div>
              <h3>
                {label}
                <span>{route}</span>
              </h3>
              <p>{description}</p>
            </div>
          </div>
        ))}
        <p className="asset-guide-footnote">
          Public deposits and withdrawals remain visible on-chain. Keeping assets private does not
          make these entry and exit transactions invisible.
        </p>
      </Panel>
      <button type="button" className="asset-wallet-link" onClick={() => wallet.setModal(true)}>
        <Wallet aria-hidden="true" size={19} />
        <span>
          Balances & accounts<small>View public and private assets in your wallet.</small>
        </span>
        <ArrowRight aria-hidden="true" size={16} />
      </button>
    </aside>
  );
}
