import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { ArrowRight, Check, ChevronDown, Globe2, Wallet } from 'lucide-react';
import { useWallet } from '../model/WalletProvider';

export function NetworkSelector() {
  const wallet = useWallet();
  const networks = wallet.account ? (wallet.capabilities?.networks ?? []) : [];
  const current = networks.find((network) => network.chainId === wallet.chainId);
  const label = current?.name ?? 'Network';

  return (
    <Dropdown.Root>
      <Dropdown.Trigger
        className="network-selector"
        aria-label={current ? `Network: ${current.name}` : 'Choose network'}
        disabled={wallet.busy}
      >
        {current ? (
          <span className="network-selector-status" aria-hidden="true" />
        ) : (
          <Globe2 className="network-selector-icon" aria-hidden="true" size={14} />
        )}
        <span className="network-selector-label">{label}</span>
        <ChevronDown className="network-selector-caret" aria-hidden="true" size={12} />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          className="network-menu"
          align="end"
          sideOffset={12}
          collisionPadding={16}
        >
          <Dropdown.Label className="network-menu-heading">Network</Dropdown.Label>
          {networks.length ? (
            <>
              <p className="network-menu-description">Choose where you transact.</p>
              {networks.map((network) => (
                <Dropdown.Item
                  key={network.chainId}
                  className="network-menu-item"
                  disabled={wallet.busy}
                  onSelect={() => {
                    if (network.chainId !== wallet.chainId)
                      void wallet.switchChain(network.chainId);
                  }}
                >
                  <span className="network-menu-symbol" aria-hidden="true">
                    {network.nativeSymbol.slice(0, 1)}
                  </span>
                  <span className="network-menu-name">
                    {network.name}
                    <small>{network.nativeSymbol}</small>
                  </span>
                  {network.chainId === wallet.chainId && (
                    <Check className="network-menu-check" aria-label="Current network" size={15} />
                  )}
                </Dropdown.Item>
              ))}
            </>
          ) : (
            <>
              <p className="network-menu-description">
                Connect your wallet to see available networks.
              </p>
              <Dropdown.Item
                className="network-menu-item network-menu-connect"
                onSelect={() => wallet.setModal(true)}
              >
                <Wallet aria-hidden="true" size={15} />
                <span>Connect wallet</span>
                <ArrowRight aria-hidden="true" size={14} />
              </Dropdown.Item>
            </>
          )}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
