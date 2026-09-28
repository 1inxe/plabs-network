import * as Dropdown from '@radix-ui/react-dropdown-menu';
import {
  ArrowRight,
  ArrowUpRight,
  EyeOff,
  LogOut,
  MoreHorizontal,
  Puzzle,
  Wallet,
} from 'lucide-react';
import { Badge, Notice } from '@/shared/ui';
import { Drawer } from '@/shared/ui/Drawer';
import { useWallet } from '../model/WalletProvider';
import { NetworkSelector } from './NetworkSelector';
import { WalletDetails } from './WalletDetails';
import { WalletFeedback } from './WalletFeedback';

export function WalletDrawer() {
  const w = useWallet();
  return (
    <Drawer
      open={w.modal}
      onOpenChange={w.setModal}
      title={w.account ? 'Wallet' : 'Connect your wallet'}
      description={
        w.account
          ? 'Your accounts, assets and activity.'
          : 'A private home for your on-chain assets.'
      }
      icon={<img className="drawer-brand" src="/assets/plabs-network.png" alt="" />}
      descriptionHidden={!!w.account}
      accessory={w.account ? <NetworkSelector /> : undefined}
      footer={
        w.account ? (
          <div className="wallet-drawer-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={w.openingWallet}
              onClick={() => void w.open()}
            >
              <Wallet aria-hidden="true" size={15} />
              Open extension
              <ArrowUpRight aria-hidden="true" size={13} />
            </button>
            <Dropdown.Root>
              <Dropdown.Trigger className="icon-button" aria-label="Wallet connection settings">
                <MoreHorizontal aria-hidden="true" size={19} />
              </Dropdown.Trigger>
              <Dropdown.Portal>
                <Dropdown.Content
                  className="network-menu wallet-settings-menu"
                  align="end"
                  side="top"
                  sideOffset={10}
                  collisionPadding={12}
                >
                  <Dropdown.Label className="network-menu-heading">Connection</Dropdown.Label>
                  <Dropdown.Item
                    className="network-menu-item"
                    disabled={w.busy || !w.privacyScopes.length}
                    onSelect={() => void w.revokeRead()}
                  >
                    <EyeOff aria-hidden="true" size={15} />
                    Revoke data access
                  </Dropdown.Item>
                  <Dropdown.Item
                    className="network-menu-item"
                    disabled={w.busy}
                    onSelect={() => void w.disconnect()}
                  >
                    <LogOut aria-hidden="true" size={15} />
                    Disconnect wallet
                  </Dropdown.Item>
                </Dropdown.Content>
              </Dropdown.Portal>
            </Dropdown.Root>
          </div>
        ) : (
          <span className="wallet-drawer-assurance">Your keys stay in PLabs Wallet.</span>
        )
      }
    >
      {w.account ? (
        <WalletDetails />
      ) : (
        <div className="wallet-connect-view">
          <div className="wallet-option">
            <img src="/assets/plabs-network.png" alt="PLabs Wallet" />
            <div>
              <strong>PLabs Wallet</strong>
              <p>{w.wallet ? 'Ready to connect' : 'Browser extension'}</p>
            </div>
            <Badge tone={w.wallet ? 'green' : 'gray'}>
              {w.wallet ? 'Detected' : 'Not detected'}
            </Badge>
          </div>
          <Notice>
            One approval connects your wallet and shares addresses, balances, activity, note
            summaries and PEX orders. Access is remembered until you revoke it; each transaction
            still needs confirmation.
          </Notice>
          {!w.wallet && (
            <div className="wallet-install-help">
              <Puzzle aria-hidden="true" size={22} />
              <p>
                Enable PLabs Wallet in this browser, then reload the page. Mobile browsers need
                extension support.
              </p>
            </div>
          )}
          <button
            type="button"
            className="primary-button w-full"
            disabled={w.busy || !w.wallet}
            onClick={() => void w.connect()}
          >
            {w.busy ? 'Waiting for wallet…' : 'Connect PLabs Wallet'}
            <ArrowRight aria-hidden="true" size={16} />
          </button>
        </div>
      )}
      <WalletFeedback inDrawer />
    </Drawer>
  );
}
