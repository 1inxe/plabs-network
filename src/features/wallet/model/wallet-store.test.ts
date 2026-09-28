import { describe, expect, it, vi } from 'vitest';
import type {
  Capabilities,
  OperationResult,
  WalletAdapter,
  WalletSession,
} from '@/services/wallet';
import { WalletStore } from './wallet-store';

const pool = `0x${'a'.repeat(40)}`;
const capabilities: Capabilities = {
  version: 1,
  methods: {
    personalSign: true,
    signTypedData: false,
    evmTransactions: false,
    evmPreview: true,
    privacyTransactions: true,
  },
  networks: [
    {
      chainId: 143,
      name: 'Monad',
      nativeSymbol: 'MON',
      pools: [{ address: pool, symbol: 'sUSDC', canShield: true, canUnshield: true }],
    },
  ],
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function fixture() {
  let change = () => {};
  let disconnected = () => {};
  let session: WalletSession = { accounts: ['0x111'], chainId: 143, capabilities };
  const unsubscribe = vi.fn();
  const adapter: WalletAdapter = {
    session: vi.fn(async () => session),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    open: vi.fn(async () => {}),
    privacyAddress: vi.fn(async () => ({ address: `perc1${'a'.repeat(40)}`, chainId: 143 })),
    switchChain: vi.fn(async (chainId) => {
      session = { ...session, chainId };
      change();
    }),
    transact: vi.fn(async () => ({ id: 'op-1', state: 'pending' as const })),
    transactionStatus: vi.fn(async (id: string) => ({
      id,
      state: 'confirmed' as const,
      txHash: `0x${'a'.repeat(64)}`,
    })),
    subscribe: (c, d) => {
      change = c;
      disconnected = d;
      return unsubscribe;
    },
  };
  return {
    adapter,
    unsubscribe,
    change: (next: Partial<WalletSession>) => {
      session = { ...session, ...next };
      change();
    },
    disconnected,
  };
}
async function setup() {
  const f = fixture();
  const store = new WalletStore();
  store.attach(f.adapter);
  await vi.waitFor(() => expect(store.getSnapshot().account).toBe('0x111'));
  return { store, ...f };
}
describe('Extension-only wallet session', () => {
  it('discovers passively and never requests a connection or privacy address on mount', async () => {
    const { store, adapter, unsubscribe } = await setup();
    expect(adapter.connect).not.toHaveBeenCalled();
    expect(adapter.privacyAddress).not.toHaveBeenCalled();
    const callback = vi.fn();
    const stop = store.subscribe(callback);
    store.setModal(true);
    expect(callback).toHaveBeenCalled();
    stop();
    store.detach();
    expect(unsubscribe).toHaveBeenCalled();
    expect(store.getSnapshot().account).toBe('');
  });
  it('shows an actionable state when the extension is unavailable', async () => {
    const store = new WalletStore();
    await store.connect();
    expect(store.getSnapshot()).toMatchObject({ modal: true, busy: false });
    expect(store.getSnapshot().error).toContain('Enable');
  });
  it('connects only on intent and treats privacy disclosure separately', async () => {
    const { store, adapter } = await setup();
    store.setModal(true);
    await store.connect();
    expect(adapter.connect).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().modal).toBe(false);
    await store.reveal();
    expect(store.getSnapshot().privacyAddress).toMatch(/^perc1/);
    await store.open();
    expect(adapter.open).toHaveBeenCalledTimes(1);
  });
  it('keeps exact decimal amounts and canonical pool symbols', async () => {
    const { store, adapter } = await setup();
    await store.transact('shield', pool, '0.000000000000000001', 'fake symbol');
    expect(adapter.transact).toHaveBeenCalledWith({
      kind: 'shield',
      chainId: 143,
      poolAddress: pool,
      amount: '0.000000000000000001',
    });
    expect(store.getSnapshot().activities[0]).toMatchObject({
      state: 'pending' as const,
      symbol: 'sUSDC',
    });
    await store.refreshStatus('op-1');
    expect(store.getSnapshot().activities[0]?.state).toBe('confirmed');
  });
  it('blocks duplicate submissions while the wallet awaits approval', async () => {
    const { store, adapter } = await setup();
    const waiting = deferred<OperationResult>();
    vi.mocked(adapter.transact).mockReturnValue(waiting.promise);
    const first = store.transact('shield', pool, '1', 'sUSDC');
    await store.transact('shield', pool, '1', 'sUSDC');
    expect(adapter.transact).toHaveBeenCalledTimes(1);
    waiting.resolve({ id: 'op', state: 'pending' as const });
    await first;
    expect(store.getSnapshot().busy).toBe(false);
  });
  it('discards approvals that resolve after the account changes', async () => {
    const { store, adapter, change } = await setup();
    const waiting = deferred<OperationResult>();
    vi.mocked(adapter.transact).mockReturnValue(waiting.promise);
    const request = store.transact('shield', pool, '1', 'sUSDC');
    change({ accounts: ['0x222'] });
    waiting.resolve({ id: 'old-account', state: 'confirmed' as const });
    expect(await request).toBeUndefined();
    expect(store.getSnapshot().activities).toEqual([]);
    await vi.waitFor(() => expect(store.getSnapshot().account).toBe('0x222'));
  });
  it('does not attach a stale privacy address or error to a new account', async () => {
    const { store, adapter, change } = await setup();
    const waiting = deferred<{ address: string; chainId: number }>();
    vi.mocked(adapter.privacyAddress).mockReturnValue(waiting.promise);
    const request = store.reveal();
    change({ accounts: ['0x222'] });
    waiting.resolve({ address: 'perc1-old', chainId: 143 });
    await request;
    expect(store.getSnapshot().privacyAddress).toBe('');
    const failed = deferred<OperationResult>();
    vi.mocked(adapter.transact).mockReturnValue(failed.promise);
    await vi.waitFor(() => expect(store.getSnapshot().account).toBe('0x222'));
    const action = store.transact('shield', pool, '1', 'sUSDC');
    change({ accounts: ['0x333'] });
    failed.reject(new Error('old-session-error'));
    await action;
    expect(store.getSnapshot().error).toBe('');
  });
  it('rejects unsupported pools, amounts, transfers, and unknown operation ids', async () => {
    const { store, adapter } = await setup();
    for (const [kind, p, amount, to] of [
      ['shield', 'unknown', '1', ''],
      ['shield', pool, '-1', ''],
      ['send', pool, '1', 'bad-recipient'],
    ] as const) {
      await store.transact(kind, p, amount, 'sUSDC', to);
      expect(store.getSnapshot().error).not.toBe('');
    }
    await store.refreshStatus('another-origin');
    expect(adapter.transactionStatus).not.toHaveBeenCalled();
    expect(adapter.transact).not.toHaveBeenCalled();
  });
  it('respects per-pool capability flags', async () => {
    const { store, adapter, change } = await setup();
    change({
      capabilities: {
        ...capabilities,
        networks: [
          {
            chainId: 143,
            name: 'Monad',
            nativeSymbol: 'MON',
            pools: [{ address: pool, symbol: 'sUSDC', canShield: false, canUnshield: false }],
          },
        ],
      },
    });
    await vi.waitFor(() => expect(store.getSnapshot().account).toBe('0x111'));
    await store.transact('unshield', pool, '1', 'sUSDC');
    await store.transact('shield', pool, '1', 'sUSDC');
    expect(adapter.transact).not.toHaveBeenCalled();
  });
  it('routes transfer and unshield intents without invented destination fields', async () => {
    const { store, adapter } = await setup();
    const recipient = `perc1${'a'.repeat(30)}`;
    await store.transact('send', pool, '2', 'sUSDC', recipient);
    expect(adapter.transact).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'send', recipient }),
    );
    await store.transact('unshield', pool, '2', 'sUSDC');
    expect(adapter.transact).toHaveBeenLastCalledWith({
      kind: 'unshield',
      chainId: 143,
      poolAddress: pool,
      amount: '2',
    });
  });
  it('clears private state on network switch and disconnect', async () => {
    const { store } = await setup();
    await store.transact('shield', pool, '1', 'sUSDC');
    await store.reveal();
    await store.switchChain(1);
    expect(store.getSnapshot()).toMatchObject({ chainId: 1, activities: [], privacyAddress: '' });
    await store.disconnect();
    expect(store.getSnapshot()).toMatchObject({ account: '', modal: false, activities: [] });
  });
  it('surfaces rejected wallet actions without making a fake transaction', async () => {
    const { store, adapter } = await setup();
    vi.mocked(adapter.transact).mockRejectedValue(
      Object.assign(new Error('rejected'), { code: 4001 }),
    );
    await store.transact('shield', pool, '1', 'sUSDC');
    expect(store.getSnapshot().error).toContain('declined');
    expect(store.getSnapshot().activities).toEqual([]);
  });
  it('requires a connected account for disclosure, switching and transactions', async () => {
    const { store, change, adapter } = await setup();
    change({ accounts: [] });
    await store.reveal();
    await store.switchChain(1);
    await store.transact('shield', pool, '1', 'sUSDC');
    expect(store.getSnapshot().modal).toBe(true);
    expect(adapter.privacyAddress).not.toHaveBeenCalled();
    expect(adapter.transact).not.toHaveBeenCalled();
  });
  it('handles unreadable wallet sessions and ignores late session reads after teardown', async () => {
    const f = fixture(),
      store = new WalletStore();
    vi.mocked(f.adapter.session).mockRejectedValueOnce(new Error('locked'));
    store.attach(f.adapter);
    await vi.waitFor(() => expect(store.getSnapshot().error).toContain('Unlock'));
    store.detach();
    const waiting = deferred<WalletSession>();
    vi.mocked(f.adapter.session).mockReturnValue(waiting.promise);
    store.attach(f.adapter);
    store.detach();
    waiting.resolve({ accounts: ['0x111'], chainId: 143, capabilities });
    await Promise.resolve();
    expect(store.getSnapshot().wallet).toBeNull();
    expect(store.getSnapshot().account).toBe('');
  });
});

describe('authorized private account data', () => {
  async function setupReads() {
    const f = await setup();
    const scopes: import('@/services/wallet').PrivacyReadScope[] = [];
    const expiry = Date.now() + 60000;
    f.change({
      capabilities: { ...capabilities, methods: { ...capabilities.methods, privacyRead: true } },
    });
    await vi.waitFor(() =>
      expect(f.store.getSnapshot().capabilities?.methods.privacyRead).toBe(true),
    );
    f.adapter.requestAccess = vi.fn(async (requested) => {
      for (const scope of [
        'address',
        ...requested,
      ] as import('@/services/wallet').PrivacyReadScope[])
        if (!scopes.includes(scope)) scopes.push(scope);
      return {
        version: 1 as const,
        chainId: '0x8f' as const,
        address: `perc1${'a'.repeat(40)}`,
        scopes: [...scopes],
        expiresAt: expiry,
      };
    });
    f.adapter.balances = vi.fn(async () => ({
      chainId: '0x8f' as const,
      privacyAddress: 'perc1-test',
      fetchedAt: 1,
      public: { assets: [] },
      private: { assets: [] },
    }));
    f.adapter.history = vi.fn(async () => ({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      pages: 1,
      coverage: 'wallet-and-received-notes' as const,
      syncComplete: true,
    }));
    f.adapter.notes = vi.fn(async () => ({ items: [], page: 1, pageSize: 20, total: 0, pages: 1 }));
    f.adapter.dexOrders = vi.fn(async () => ({
      orders: [],
      source: 'official-matcher' as const,
      importedAt: null,
      fetchedAt: 1,
      needsImport: true,
      canPlaceOrders: false as const,
    }));
    f.adapter.importDexOrders = vi.fn(async () => ({ imported: 0 }));
    f.adapter.revokeAccess = vi.fn(async () => {});
    return f;
  }
  it('requests all read scopes together at connection', async () => {
    const { store, adapter } = await setupReads();
    await store.connect();
    expect(adapter.requestAccess).toHaveBeenCalledWith([
      'address',
      'balances',
      'history',
      'notes',
      'dexOrders',
    ]);
    expect(store.getSnapshot().privacyAddress).toMatch(/^perc1/);
    await store.refreshPortfolio();
    expect(adapter.balances).toHaveBeenCalled();
  });
  it('loads scoped balances and history only after approval', async () => {
    const { store, adapter } = await setupReads();
    await store.authorizeRead(['balances', 'history']);
    expect(adapter.balances).toHaveBeenCalledTimes(1);
    expect(adapter.history).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().portfolio?.chainId).toBe('0x8f');
    await store.reveal();
    expect(store.getSnapshot().privacyScopes).toContain('balances');
  });
  it('loads Notes and official order summaries through the adapter', async () => {
    const { store, adapter } = await setupReads();
    await store.authorizeRead(['notes', 'dexOrders']);
    await store.loadNotes(2);
    expect(adapter.notes).toHaveBeenCalledWith({ page: 2, pageSize: 20 });
    await store.loadDexOrders();
    expect(store.getSnapshot().dexOrders?.needsImport).toBe(true);
    await store.importDexOrders();
    expect(adapter.importDexOrders).toHaveBeenCalled();
  });
  it('clears all private data when disclosure is revoked or expires', async () => {
    const { store, adapter } = await setupReads();
    await store.authorizeRead(['balances', 'history']);
    await store.revokeRead();
    expect(adapter.revokeAccess).toHaveBeenCalled();
    expect(store.getSnapshot()).toMatchObject({
      portfolio: null,
      history: null,
      privacyAddress: '',
      privacyScopes: [],
    });
    await store.authorizeRead(['balances']);
    store.expirePrivacy();
    expect(store.getSnapshot().portfolio).toBeNull();
  });
  it('discards late portfolio responses after an account switch', async () => {
    const { store, adapter, change } = await setupReads();
    await store.authorizeRead(['balances']);
    const waiting = deferred<import('@/services/wallet').WalletPortfolio>();
    adapter.balances = () => waiting.promise;
    const request = store.refreshPortfolio();
    change({ accounts: ['0x222'] });
    waiting.resolve({
      chainId: '0x8f' as const,
      privacyAddress: 'old',
      fetchedAt: 1,
      public: { assets: [] },
      private: { assets: [] },
    });
    await request;
    expect(store.getSnapshot().portfolio).toBeNull();
  });
  it('clears private data when the extension reports revoked permission', async () => {
    const { store, adapter } = await setupReads();
    await store.authorizeRead(['balances']);
    adapter.balances = vi.fn(async () => {
      throw Object.assign(new Error('Read access revoked'), { code: 4100 });
    });
    await store.refreshPortfolio();
    expect(store.getSnapshot()).toMatchObject({ portfolio: null, privacyScopes: [] });
    expect(store.getSnapshot().readError).toContain('revoked');
  });
  it('reopens the wallet while approval is pending instead of dropping the action', async () => {
    const { store, adapter } = await setupReads();
    const pending = deferred<import('@/services/wallet').PrivacySession>();
    adapter.requestAccess = vi.fn(() => pending.promise);
    const authorization = store.authorizeRead(['balances']);
    await vi.waitFor(() => expect(store.getSnapshot().readAuthorization).toBe('waiting'));
    await store.open();
    expect(adapter.open).toHaveBeenCalledOnce();
    expect(store.getSnapshot().busy).toBe(true);
    pending.reject(Object.assign(new Error('rejected'), { code: 4001 }));
    await authorization;
    expect(store.getSnapshot().readAuthorizationError).toContain('declined');
    expect(store.getSnapshot().busy).toBe(false);
  });
  it('refreshes stale capabilities after an extension update', async () => {
    const { store, adapter } = await setupReads();
    await store.authorizeRead(['address']);
    adapter.session = vi.fn(async () => ({
      accounts: ['0x111'],
      chainId: 143,
      capabilities: { ...capabilities, methods: { ...capabilities.methods, privacyRead: false } },
    }));
    await store.authorizeRead(['balances']);
    expect(store.getSnapshot().readAuthorizationError).toContain('Update PLabs Wallet');
  });
  it('reports an incomplete grant instead of silently doing nothing', async () => {
    const { store, adapter } = await setupReads();
    adapter.requestAccess = vi.fn(async () => ({
      version: 1 as const,
      chainId: '0x8f' as const,
      address: 'perc1-test',
      scopes: ['address' as const],
      expiresAt: Date.now() + 60000,
    }));
    await store.authorizeRead(['balances']);
    expect(store.getSnapshot().readAuthorizationError).toContain('did not grant');
    expect(adapter.balances).not.toHaveBeenCalled();
  });
  it('reports an approval window opening failure even while waiting for permission', async () => {
    const { store, adapter } = await setupReads();
    adapter.open = vi.fn(async () => {
      throw new Error('Browser blocked the wallet window');
    });
    await store.open();
    expect(store.getSnapshot().walletOpenError).toContain('blocked');
    expect(store.getSnapshot().openingWallet).toBe(false);
  });
  it('does not leave an approved read stuck in loading after privacy access expires', async () => {
    const { store, adapter } = await setupReads();
    const pending = deferred<import('@/services/wallet').WalletPortfolio>();
    adapter.balances = () => pending.promise;
    const request = store.authorizeRead(['balances']);
    await vi.waitFor(() => expect(store.getSnapshot().readAuthorization).toBe('loading'));
    store.expirePrivacy();
    pending.resolve({
      chainId: '0x8f',
      privacyAddress: 'expired',
      fetchedAt: 1,
      public: { assets: [] },
      private: { assets: [] },
    });
    await request;
    expect(store.getSnapshot()).toMatchObject({
      readAuthorization: 'idle',
      portfolio: null,
      privacyScopes: [],
    });
  });
  it('explains the update requirement for older wallets', async () => {
    const { store } = await setup();
    await store.authorizeRead(['balances']);
    expect(store.getSnapshot().readAuthorizationError).toContain('Update PLabs Wallet');
  });
});
