import type { PlabsProvider } from '@plabs-wallet/sdk';
import { createPlabsWallet, discoverPlabsWallets } from '@plabs-wallet/sdk';
import { walletReadTimeout } from './request-timeout';
import type { WalletAdapter } from './types';
export function createPlabsAdapter(provider: PlabsProvider): WalletAdapter {
  const sdk = createPlabsWallet(provider);
  return {
    async session() {
      const [accounts, chainId, capabilities] = await walletReadTimeout(
        Promise.all([sdk.getAccounts(), sdk.evm.getChainId(), sdk.capabilities()]),
      );
      const privacy = capabilities.methods.privacyRead
        ? await walletReadTimeout(sdk.privacy.getSession())
        : undefined;
      return { accounts, chainId: Number(chainId), capabilities, privacy };
    },
    requestAccess: (scopes) => sdk.privacy.requestAccess(scopes),
    revokeAccess: () => sdk.privacy.revokeAccess(),
    balances: () => sdk.privacy.getBalances(),
    history: (params) => sdk.privacy.getHistory(params),
    notes: (params) => sdk.privacy.getNotes(params),
    dexOrders: () => sdk.privacy.getDexOrders(),
    importDexOrders: () => sdk.privacy.importOfficialDexOrders(),
    placeDexOrder: (intent) => sdk.privacy.placeDexOrder(intent),
    resumeDexOrder: (id) => sdk.privacy.resumeDexOrder(id),
    cancelDexOrder: (id) => sdk.privacy.cancelDexOrder(id),
    collectDexPayouts: (id) => sdk.privacy.collectDexPayouts(id),
    async connect() {
      const capabilities = await sdk.capabilities();
      await sdk.connect(
        capabilities.methods.unifiedConnect
          ? { privacyScopes: ['address', 'balances', 'history', 'notes', 'dexOrders'] }
          : undefined,
      );
    },
    disconnect: () => sdk.disconnect(),
    async open() {
      const result = await walletReadTimeout(sdk.open(), 8000);
      if (!result.opened)
        throw new Error(
          'Your browser could not open PLabs Wallet. Click the extension icon in the browser toolbar to view the pending approval.',
        );
    },
    async privacyAddress() {
      const result = await sdk.privacy.getAddress();
      return { ...result, chainId: Number(result.chainId) };
    },
    switchChain: (id) => sdk.evm.switchChain(id),
    transact(intent) {
      const params = {
        chainId: intent.chainId,
        poolAddress: intent.poolAddress,
        amount: intent.amount,
      };
      if (intent.kind === 'shield') return sdk.privacy.shield(params);
      if (intent.kind === 'unshield') return sdk.privacy.unshield(params);
      return sdk.privacy.sendTransaction({ ...params, to: intent.recipient ?? '' });
    },
    transactionStatus: (id) => sdk.privacy.getTransactionStatus(id),
    subscribe(onContextChanged, onDisconnect, onPrivacyChanged) {
      const privacyChanged = (payload: unknown) => {
        if (!onPrivacyChanged) {
          onContextChanged();
          return;
        }
        onPrivacyChanged(
          payload &&
            typeof payload === 'object' &&
            'unlocked' in payload &&
            payload.unlocked === true
            ? { unlocked: true }
            : undefined,
        );
      };
      provider.on('accountsChanged', onContextChanged);
      provider.on('chainChanged', onContextChanged);
      provider.on('disconnect', onDisconnect);
      provider.on('privacySessionChanged', privacyChanged);
      return () => {
        provider.removeListener('accountsChanged', onContextChanged);
        provider.removeListener('chainChanged', onContextChanged);
        provider.removeListener('disconnect', onDisconnect);
        provider.removeListener('privacySessionChanged', privacyChanged);
      };
    },
  };
}
export const discoverWallet = (onWallet: (adapter: WalletAdapter) => void) =>
  discoverPlabsWallets(({ provider }) => onWallet(createPlabsAdapter(provider)));
