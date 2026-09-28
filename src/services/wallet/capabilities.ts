import type { AssetMode } from '@/shared/config/product';
import type { Capabilities } from './types';

export function supportsAssetAction(
  capabilities: Capabilities | null,
  chainId: number,
  mode: AssetMode,
): boolean {
  if (!capabilities?.methods.privacyTransactions) return false;
  return (
    capabilities.networks
      .find((network) => network.chainId === chainId)
      ?.pools.some((pool) =>
        mode === 'shield' ? pool.canShield : mode === 'unshield' ? pool.canUnshield : true,
      ) ?? false
  );
}
