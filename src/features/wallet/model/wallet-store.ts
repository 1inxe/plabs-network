import type {
  Capabilities,
  DexOrderIntent,
  DexOrderSummary,
  DexOrders,
  OperationResult,
  PrivacyHistoryPage,
  PrivacyIntent,
  PrivacyNotes,
  PrivacyReadScope,
  PrivacySession,
  WalletAdapter,
  WalletPortfolio,
} from '@/services/wallet';
import { errorMessage } from '@/shared/api/errors';
import { validAmount } from '@/shared/lib/format';
import { notify } from '@/shared/notifications';
import {
  isUserCancellation,
  operationFeedback,
  orderFeedback,
  type TransactionFeedback,
} from './transaction-feedback';
export type Activity = OperationResult & {
  kind: PrivacyIntent['kind'];
  amount: string;
  symbol: string;
  createdAt: number;
  account: string;
  chainId: number;
};
export type WalletSnapshot = {
  wallet: WalletAdapter | null;
  account: string;
  chainId: number;
  capabilities: Capabilities | null;
  privacyAddress: string;
  privacyScopes: PrivacyReadScope[];
  privacyExpiresAt: number | null;
  portfolio: WalletPortfolio | null;
  history: PrivacyHistoryPage | null;
  notes: PrivacyNotes | null;
  dexOrders: DexOrders | null;
  lastDexOrder: DexOrderSummary | null;
  readError: string;
  readAuthorization: 'idle' | 'checking' | 'waiting' | 'loading' | 'error';
  readAuthorizationSource: PrivacyReadScope | null;
  readAuthorizationError: string;
  openingWallet: boolean;
  walletOpenError: string;
  busy: boolean;
  error: string;
  errorCategory: 'wallet' | 'transaction';
  modal: boolean;
  activities: Activity[];
};
const SITE_READ_SCOPES: PrivacyReadScope[] = [
  'address',
  'balances',
  'history',
  'notes',
  'dexOrders',
];
const initial = (): WalletSnapshot => ({
  wallet: null,
  account: '',
  chainId: 0,
  capabilities: null,
  privacyAddress: '',
  privacyScopes: [],
  privacyExpiresAt: null,
  portfolio: null,
  history: null,
  notes: null,
  dexOrders: null,
  lastDexOrder: null,
  readError: '',
  readAuthorization: 'idle',
  readAuthorizationSource: null,
  readAuthorizationError: '',
  openingWallet: false,
  walletOpenError: '',
  busy: false,
  error: '',
  errorCategory: 'wallet',
  modal: false,
  activities: [],
});
/** Memory-only session. Context revisions prevent stale approvals from crossing accounts or chains. */
export class WalletStore {
  private state = initial();
  private listeners = new Set<() => void>();
  private revision = 0;
  private binding = 0;
  private disposeAdapter?: () => void;
  private locked = false;
  private restoration?: {
    revision: number;
    binding: number;
    adapter: WalletAdapter;
    promise: Promise<void>;
  };
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private patch(partial: Partial<WalletSnapshot>) {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener();
  }
  private reportTransaction(feedback: TransactionFeedback | null) {
    if (!feedback) return;
    const { kind, href, ...content } = feedback;
    notify[kind]({
      ...content,
      scope: 'wallet',
      action: { label: href === '/pex' ? 'View orders' : 'View activity', href },
    });
  }
  private clearContext() {
    notify.clearScope('wallet');
    this.revision++;
    this.patch({
      account: '',
      chainId: 0,
      privacyAddress: '',
      privacyScopes: [],
      privacyExpiresAt: null,
      portfolio: null,
      history: null,
      notes: null,
      dexOrders: null,
      lastDexOrder: null,
      readError: '',
      readAuthorization: 'idle',
      readAuthorizationSource: null,
      readAuthorizationError: '',
      walletOpenError: '',
      capabilities: null,
      activities: [],
      error: '',
      errorCategory: 'wallet',
    });
  }
  attach(adapter: WalletAdapter) {
    if (this.state.wallet) return;
    const binding = ++this.binding;
    this.patch({ wallet: adapter });
    this.disposeAdapter = adapter.subscribe(
      () => {
        this.clearContext();
        void this.restore(adapter, binding);
      },
      () => this.clearContext(),
      (event) => {
        if (event?.unlocked) {
          if (!this.locked) void this.restore(adapter, binding).then(() => this.refreshReadData());
        } else this.expirePrivacy();
      },
    );
    void this.restore(adapter, binding);
  }
  detach() {
    this.binding++;
    this.disposeAdapter?.();
    this.disposeAdapter = undefined;
    this.clearContext();
    this.patch({ wallet: null });
  }
  private restore(adapter: WalletAdapter, binding: number): Promise<void> {
    const revision = this.revision;
    const active = this.restoration;
    if (active?.adapter === adapter && active.binding === binding && active.revision === revision)
      return active.promise;
    const promise = (async () => {
      try {
        const s = await adapter.session();
        if (revision === this.revision && binding === this.binding)
          this.patch({
            account: s.accounts[0] ?? '',
            chainId: s.chainId,
            capabilities: s.capabilities,
            privacyAddress: s.privacy?.address ?? '',
            privacyScopes: s.privacy?.scopes ?? [],
            privacyExpiresAt: s.privacy?.expiresAt ?? null,
          });
      } catch {
        if (revision === this.revision && binding === this.binding)
          this.patch({
            errorCategory: 'wallet',
            error: 'Unable to read wallet session. Unlock the extension and reconnect.',
          });
      }
    })();
    this.restoration = { revision, binding, adapter, promise };
    void promise.finally(() => {
      if (this.restoration?.promise === promise) this.restoration = undefined;
    });
    return promise;
  }
  private async run<T>(
    action: (adapter: WalletAdapter) => Promise<T>,
    transaction?: { title: string; href: string },
  ): Promise<T | undefined> {
    if (this.locked) return;
    const adapter = this.state.wallet;
    if (!adapter) {
      this.patch({
        modal: true,
        errorCategory: 'wallet',
        error: 'Enable the PLabs Wallet extension in this browser, then reload this page.',
      });
      return;
    }
    this.locked = true;
    const revision = this.revision;
    this.patch({ busy: true, error: '', errorCategory: transaction ? 'transaction' : 'wallet' });
    try {
      return await action(adapter);
    } catch (error) {
      if (revision === this.revision) {
        this.patch({ error: errorMessage(error) });
        if (transaction && !isUserCancellation(error))
          notify.error({
            scope: 'wallet',
            title: transaction.title,
            message: errorMessage(error),
            action: {
              label: transaction.href === '/pex' ? 'View orders' : 'View activity',
              href: transaction.href,
            },
          });
      }
      return undefined;
    } finally {
      this.locked = false;
      this.patch({ busy: false });
    }
  }
  setModal = (modal: boolean) => this.patch({ modal, error: '' });
  connect = async () => {
    await this.run(async (adapter) => {
      await adapter.connect();
      await this.restore(adapter, this.binding);
      if (this.state.account) {
        const revision = this.revision;
        if (this.state.capabilities?.methods.privacyRead && adapter.requestAccess) {
          const session =
            SITE_READ_SCOPES.every((scope) => this.state.privacyScopes.includes(scope)) &&
            this.state.privacyExpiresAt &&
            this.state.privacyExpiresAt > Date.now()
              ? undefined
              : await adapter.requestAccess(SITE_READ_SCOPES);
          if (revision !== this.revision) return;
          if (session) this.applyPrivacySession(session);
        } else {
          const result = await adapter.privacyAddress();
          if (revision !== this.revision) return;
          this.patch({ privacyAddress: result.address });
        }
        this.patch({ modal: false });
        void this.refreshReadData();
      }
    });
  };
  disconnect = async () => {
    await this.run(async (adapter) => {
      await adapter.disconnect();
      this.clearContext();
      this.patch({ modal: false });
    });
  };
  open = async () => {
    // Reopening the approval window must remain possible while another request awaits approval.
    const adapter = this.state.wallet;
    if (!adapter) {
      this.patch({
        modal: true,
        walletOpenError:
          'PLabs Wallet was not detected. Enable the extension and reload this page.',
      });
      return;
    }
    if (this.state.openingWallet) return;
    const binding = this.binding;
    this.patch({ openingWallet: true, walletOpenError: '' });
    try {
      await adapter.open();
    } catch (error) {
      if (binding === this.binding) this.patch({ walletOpenError: errorMessage(error) });
    } finally {
      this.patch({ openingWallet: false });
    }
  };
  private applyPrivacySession(session: PrivacySession) {
    if (Number(session.chainId) !== this.state.chainId) return;
    this.patch({
      privacyAddress: session.address ?? '',
      privacyScopes: session.scopes,
      privacyExpiresAt: session.expiresAt ?? null,
      walletOpenError: '',
    });
  }
  expirePrivacy = () => {
    notify.clearScope('wallet');
    this.revision++;
    this.patch({
      readAuthorization: this.state.readAuthorization === 'waiting' ? 'waiting' : 'idle',
      readAuthorizationError: '',
      walletOpenError: '',
      privacyAddress: '',
      privacyScopes: [],
      privacyExpiresAt: null,
      portfolio: null,
      history: null,
      notes: null,
      dexOrders: null,
      lastDexOrder: null,
      readError: '',
    });
  };
  reveal = async () => {
    if (!this.state.account) {
      this.setModal(true);
      return;
    }
    if (this.state.capabilities?.methods.privacyRead) {
      await this.authorizeRead(['address']);
      return;
    }
    const revision = this.revision;
    await this.run(async (adapter) => {
      const result = await adapter.privacyAddress();
      if (revision === this.revision && result.chainId === this.state.chainId)
        this.patch({ privacyAddress: result.address });
    });
  };
  authorizeRead = async (scopes: PrivacyReadScope[]) => {
    if (!this.state.account) {
      this.setModal(true);
      return;
    }
    if (this.locked) return;
    const revision = this.revision;
    this.patch({
      readAuthorization: 'checking',
      readAuthorizationSource: scopes.find((scope) => scope !== 'address') ?? 'address',
      readAuthorizationError: '',
      readError: '',
      walletOpenError: '',
    });
    let approved = false;
    await this.run(async (adapter) => {
      try {
        // A reloaded extension can have different capabilities from the discovery-time snapshot.
        const live = await adapter.session();
        if (
          revision !== this.revision ||
          live.accounts[0] !== this.state.account ||
          live.chainId !== this.state.chainId
        )
          throw new Error('The wallet account or network changed. Reconnect and authorize again.');
        this.patch({ capabilities: live.capabilities });
        if (!live.capabilities.methods.privacyRead || !adapter.requestAccess)
          throw new Error(
            'Update PLabs Wallet to version 0.8.0, reload the extension in your browser, then refresh this page. The connected extension does not support balance and history access.',
          );
        this.patch({ readAuthorization: 'waiting' });
        const session = await adapter.requestAccess(SITE_READ_SCOPES);
        if (revision !== this.revision)
          throw new Error('The privacy session changed while authorizing. Please authorize again.');
        if (
          Number(session.chainId) !== this.state.chainId ||
          !session.address ||
          !session.expiresAt ||
          session.expiresAt <= Date.now() ||
          !scopes.every((scope) => session.scopes.includes(scope))
        )
          throw new Error(
            'The wallet did not grant all requested permissions. Open PLabs Wallet and authorize again.',
          );
        this.applyPrivacySession(session);
        approved = true;
      } catch (error) {
        this.patch({
          readAuthorization: 'error',
          readAuthorizationSource: scopes.find((scope) => scope !== 'address') ?? 'address',
          readAuthorizationError: errorMessage(error),
        });
      }
    });
    if (approved && revision === this.revision) {
      this.patch({ readAuthorization: 'loading' });
      await this.refreshReadData();
      if (revision === this.revision) this.patch({ readAuthorization: 'idle' });
    }
  };
  revokeRead = async () => {
    await this.run(async (adapter) => {
      await adapter.revokeAccess?.();
      this.expirePrivacy();
    });
  };
  private async readData<T>(
    scope: PrivacyReadScope,
    request: (adapter: WalletAdapter) => Promise<T | undefined>,
    apply: (data: T) => void,
  ) {
    if (!this.state.privacyScopes.includes(scope)) return;
    if (this.state.privacyExpiresAt !== null && this.state.privacyExpiresAt <= Date.now()) {
      this.expirePrivacy();
      return;
    }
    const revision = this.revision,
      adapter = this.state.wallet;
    if (!adapter) return;
    this.patch({ readError: '' });
    try {
      const data = await request(adapter);
      if (data !== undefined && revision === this.revision) {
        apply(data);
      }
    } catch (error) {
      if (revision !== this.revision) return;
      if (error && typeof error === 'object' && 'code' in error && error.code === 4100)
        this.expirePrivacy();
      this.patch({ readError: errorMessage(error) });
    }
  }
  refreshPortfolio = () =>
    this.readData(
      'balances',
      (adapter) => adapter.balances?.() ?? Promise.resolve(undefined),
      (portfolio) => {
        this.patch({ portfolio });
      },
    );
  loadHistory = (page = 1) =>
    this.readData(
      'history',
      (adapter) => adapter.history?.({ page, pageSize: 20 }) ?? Promise.resolve(undefined),
      (history) => {
        this.patch({ history });
      },
    );
  loadNotes = (page = 1) =>
    this.readData(
      'notes',
      (adapter) => adapter.notes?.({ page, pageSize: 20 }) ?? Promise.resolve(undefined),
      (notes) => {
        this.patch({ notes });
      },
    );
  loadDexOrders = () =>
    this.readData(
      'dexOrders',
      (adapter) => adapter.dexOrders?.() ?? Promise.resolve(undefined),
      (dexOrders) => {
        this.patch({ dexOrders });
      },
    );
  refreshReadData = async () => {
    await this.refreshPortfolio();
    await this.loadHistory(this.state.history?.page ?? 1);
  };
  importDexOrders = async () => {
    await this.run(async (adapter) => {
      if (!adapter.importDexOrders)
        throw new Error('Update PLabs Wallet to import order references.');
      await adapter.importDexOrders();
    });
    await this.loadDexOrders();
  };
  placeDexOrder = async (intent: DexOrderIntent) => this.dexAction('placeDexOrder', intent);
  resumeDexOrder = async (id: string) => this.dexAction('resumeDexOrder', id);
  cancelDexOrder = async (id: string) => this.dexAction('cancelDexOrder', id);
  collectDexPayouts = async (id: string) => this.dexAction('collectDexPayouts', id);
  private async dexAction(
    method: 'placeDexOrder' | 'resumeDexOrder' | 'cancelDexOrder' | 'collectDexPayouts',
    input: DexOrderIntent | string,
  ) {
    const revision = this.revision;
    const previous =
      typeof input === 'string'
        ? (this.state.dexOrders?.orders.find((order) => order.localId === input) ??
          (this.state.lastDexOrder?.localId === input ? this.state.lastDexOrder : undefined))
        : undefined;
    const readOnly =
      method === 'collectDexPayouts' ||
      (method === 'resumeDexOrder' && previous?.executionState === 'open');
    const result = await this.run(
      async (adapter) => {
        if (!this.state.account || this.state.chainId !== 143)
          throw new Error('Connect PLabs Wallet on Monad first.');
        if (!this.state.capabilities?.methods.dexTrading || !adapter[method])
          throw new Error('Update PLabs Wallet to enable PEX trading.');
        const order =
          method === 'placeDexOrder'
            ? await adapter.placeDexOrder?.(input as DexOrderIntent)
            : await adapter[method]?.(input as string);
        if (order && revision === this.revision) {
          this.patch({ lastDexOrder: order });
          if (!readOnly) this.reportTransaction(orderFeedback(order, previous));
        }
        return revision === this.revision ? order : undefined;
      },
      readOnly ? undefined : { title: 'Order request failed', href: '/pex' },
    );
    if (result && revision === this.revision) {
      await this.loadDexOrders();
      await this.refreshPortfolio();
    }
    return result;
  }
  switchChain = async (chainId: number) => {
    if (!this.state.account) {
      this.setModal(true);
      return;
    }
    await this.run(async (adapter) => {
      await adapter.switchChain(chainId);
      this.clearContext();
      await this.restore(adapter, this.binding);
    });
  };
  transact = async (
    kind: Activity['kind'],
    poolAddress: string,
    amount: string,
    _symbol: string,
    recipient?: string,
  ): Promise<OperationResult | undefined> => {
    const revision = this.revision;
    const { account, chainId, capabilities } = this.state;
    return this.run(
      async (adapter) => {
        if (!account) throw new Error('Connect PLabs Wallet before submitting.');
        if (!validAmount(amount))
          throw new Error('Enter a positive decimal amount (up to 18 decimal places).');
        const pool = capabilities?.networks
          .find((n) => n.chainId === chainId)
          ?.pools.find((p) => p.address.toLowerCase() === poolAddress.toLowerCase());
        if (
          !capabilities?.methods.privacyTransactions ||
          !pool ||
          (kind === 'shield' && !pool.canShield) ||
          (kind === 'unshield' && !pool.canUnshield)
        )
          throw new Error('This operation is not supported by your wallet on this network.');
        if (kind === 'send' && !/^perc1[a-z0-9]{20,}$/i.test(recipient ?? ''))
          throw new Error('Enter a valid recipient privacy address.');
        const result = await adapter.transact({
          kind,
          chainId,
          poolAddress: pool.address,
          amount,
          ...(kind === 'send' ? { recipient } : {}),
        });
        if (revision !== this.revision) return undefined;
        const previous = this.state.activities.find((activity) => activity.id === result.id);
        this.patch({
          activities: [
            {
              ...result,
              kind,
              amount,
              symbol: pool.symbol,
              createdAt: Date.now(),
              account,
              chainId,
            },
            ...this.state.activities.filter((a) => a.id !== result.id),
          ],
        });
        this.reportTransaction(operationFeedback(result, previous));
        return result;
      },
      { title: 'Transaction request failed', href: '/history?source=session' },
    );
  };
  refreshStatus = async (id: string) => {
    const revision = this.revision;
    await this.run(async (adapter) => {
      if (!this.state.activities.some((a) => a.id === id))
        throw new Error('This operation does not belong to the current session.');
      const result = await adapter.transactionStatus(id);
      if (revision === this.revision) {
        const previous = this.state.activities.find((activity) => activity.id === id);
        this.patch({
          activities: this.state.activities.map((a) => (a.id === id ? { ...a, ...result } : a)),
        });
        this.reportTransaction(operationFeedback(result, previous));
      }
    });
  };
}
