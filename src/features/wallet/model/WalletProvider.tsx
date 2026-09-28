import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { discoverWallet } from '@/services/wallet';
import { WalletStore } from './wallet-store';

const Context = createContext<WalletStore | null>(null);
export function WalletProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new WalletStore());
  useEffect(() => {
    const stop = discoverWallet((adapter) => store.attach(adapter));
    return () => {
      stop();
      store.detach();
    };
  }, [store]);
  useEffect(() => {
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(expiry);
      const time = store.getSnapshot().privacyExpiresAt;
      if (time !== null) expiry = setTimeout(store.expirePrivacy, Math.max(0, time - Date.now()));
    };
    const stop = store.subscribe(schedule);
    schedule();
    return () => {
      stop();
      clearTimeout(expiry);
    };
  }, [store]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useWallet() {
  const store = useContext(Context);
  if (!store) throw new Error('WalletProvider is required');
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return {
    ...state,
    setModal: store.setModal,
    connect: store.connect,
    disconnect: store.disconnect,
    open: store.open,
    reveal: store.reveal,
    switchChain: store.switchChain,
    transact: store.transact,
    refreshStatus: store.refreshStatus,
    authorizeRead: store.authorizeRead,
    revokeRead: store.revokeRead,
    refreshPortfolio: store.refreshPortfolio,
    refreshReadData: store.refreshReadData,
    loadHistory: store.loadHistory,
    loadNotes: store.loadNotes,
    loadDexOrders: store.loadDexOrders,
    importDexOrders: store.importDexOrders,
    placeDexOrder: store.placeDexOrder,
    resumeDexOrder: store.resumeDexOrder,
    cancelDexOrder: store.cancelDexOrder,
    collectDexPayouts: store.collectDexPayouts,
  };
}
