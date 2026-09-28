import type { Page } from '@playwright/test';
export const account = `0x${'1'.repeat(40)}`;
export const pool = `0x${'a'.repeat(40)}`;
export async function mockApis(page: Page) {
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body: unknown = {};
      if (path.endsWith('/healthz'))
        body = {
          status: 'ok',
          base: `0x${'f'.repeat(40)}`,
          quote: pool,
          fee_pool: pool,
          price_tick: '100',
          lot_size: 10000,
          persistence_healthy: true,
          chain_id: 143,
          base_name: 'P20',
          quote_name: 'sUSDC',
          base_decimals: 6,
          quote_decimals: 6,
          price_scale: 1000000,
          settle_enabled: false,
          fee_units: 500000,
        };
      else if (path.endsWith('/market/stats'))
        body = {
          as_of_ms: 1790424960000,
          fully_diluted_supply: '1000000000',
          vwap_24h: '0.001',
          spot_fdv: '1050000',
          matched_base_volume_24h: '112000',
          fdv_change_percent: '-8.6956',
        };
      else if (path.endsWith('/book'))
        body = {
          asks: [
            { price: '1300', qty: 19000000000 },
            { price: '1400', qty: 120000000000 },
          ],
          bids: [{ price: '800', qty: 50000000000 }],
          base_name: 'P20',
          quote_name: 'sUSDC',
        };
      else if (path.endsWith('/candles/history'))
        body = {
          as_of_ms: 1790424960000,
          candles: [
            {
              ts: 1790253900000,
              open: '1000',
              high: '1100',
              low: '900',
              close: '1050',
              volume: '10000000000',
            },
            {
              ts: 1790331300000,
              open: '1050',
              high: '1200',
              low: '950',
              close: '1000',
              volume: '12000000000',
            },
          ],
        };
      else if (path.endsWith('/shield/stats'))
        body = {
          pools: [
            {
              pool_address: pool,
              metadata: { name: 'Shield USDC', symbol: 'sUSDC', decimals: 6, pool_type: 'wrapped' },
              current_shielded_units: '3125209300',
              total_shielded_units: '10052497300',
              total_unshielded_units: '6927288000',
              total_fee_units: '313000000',
            },
          ],
        };
      else if (path.endsWith('/txs'))
        body = {
          items: [
            {
              tx_hash: `0x${'b'.repeat(64)}`,
              block_number: 108484339,
              block_time: 1790517866,
              tx_type: 'transfer',
              symbol: 'P20',
              decimals: 6,
              notes: [],
            },
          ],
          next_before_block: null,
        };
      else if (path.endsWith('/tx'))
        body = [{ cmx: `0x${'c'.repeat(64)}`, pool, symbol: 'P20', decimals: 6 }];
      else if (path.endsWith('/wallet/stats')) body = { privacy_wallet_users: 1014434 };
      else if (path.endsWith('/whitelist/status'))
        body = {
          campaign_id: 'privasea-whitelist',
          ends_at: '2099-09-28T12:00:00.000Z',
          closed: false,
          submitted_count: 6300,
        };
      else if (path.endsWith('/stats')) body = { total_transactions: 209181 };
      await route.fulfill({ json: body });
    },
  );
}
export async function mockWallet(page: Page, privacyReads = false) {
  await page.addInitScript(
    ({ account, pool, privacyReads }) => {
      let scopes: string[] = [];
      let connected = false;
      let current = account;
      const calls: { method: string; params?: unknown }[] = [];
      const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
      const capabilities = {
        version: 1,
        methods: {
          personalSign: true,
          signTypedData: false,
          evmTransactions: false,
          evmPreview: true,
          privacyTransactions: true,
          privacyRead: privacyReads,
          privacyHistory: privacyReads,
          privacyNotes: privacyReads,
          dexOrders: privacyReads,
          unifiedConnect: privacyReads,
        },
        networks: [
          {
            chainId: 143,
            name: 'Monad Mainnet',
            nativeSymbol: 'MON',
            pools: [{ address: pool, symbol: 'sUSDC', canShield: true, canUnshield: true }],
          },
        ],
      };
      const provider = {
        isPlabsWallet: true,
        version: '0.1.0',
        async request({ method, params }: { method: string; params?: unknown }) {
          calls.push({ method, params });
          switch (method) {
            case 'eth_accounts':
              return connected ? [current] : [];
            case 'eth_chainId':
              return '0x8f';
            case 'plabs_getCapabilities':
              return capabilities;
            case 'plabs_connect': {
              connected = true;
              scopes = [...new Set(['address', ...(params as [{ scopes: string[] }])[0].scopes])];
              return {
                accounts: [current],
                chainId: '0x8f',
                privacy: {
                  version: 1,
                  chainId: '0x8f',
                  scopes,
                  address: `perc1${'a'.repeat(80)}`,
                  expiresAt: Date.now() + 60000,
                },
              };
            }
            case 'eth_requestAccounts':
              connected = true;
              return [current];
            case 'plabs_getPrivacySession':
              return {
                version: 1,
                chainId: '0x8f',
                scopes,
                ...(scopes.length
                  ? { address: `perc1${'a'.repeat(80)}`, expiresAt: Date.now() + 60000 }
                  : {}),
              };
            case 'plabs_requestPrivacyAccess': {
              const requested = (params as [{ scopes: string[] }])[0].scopes;
              scopes = [...new Set(['address', ...scopes, ...requested])];
              return {
                version: 1,
                chainId: '0x8f',
                scopes,
                address: `perc1${'a'.repeat(80)}`,
                expiresAt: Date.now() + 60000,
              };
            }
            case 'plabs_getBalances':
              return {
                chainId: '0x8f',
                privacyAddress: `perc1${'a'.repeat(80)}`,
                fetchedAt: Date.now(),
                public: {
                  assets: [
                    {
                      chainId: 143,
                      type: 'native',
                      address: null,
                      symbol: 'MON',
                      decimals: 18,
                      balanceRaw: '2500000000000000000',
                    },
                    {
                      chainId: 143,
                      type: 'erc20',
                      address: `0x${'e'.repeat(40)}`,
                      symbol: 'USDC',
                      decimals: 6,
                      balanceRaw: '12250000',
                    },
                  ],
                },
                private: {
                  assets: [
                    {
                      chainId: 143,
                      poolAddress: pool,
                      symbol: 'sUSDC',
                      decimals: 6,
                      totalRaw: '125500000',
                      spendableRaw: '100000000',
                      pendingRaw: '25500000',
                      totalNotes: 4,
                      spendableNotes: 3,
                      syncState: 'complete',
                      syncedAt: Date.now(),
                    },
                    {
                      chainId: 143,
                      poolAddress: `0x${'f'.repeat(40)}`,
                      symbol: 'P20',
                      decimals: 6,
                      totalRaw: '0',
                      spendableRaw: '0',
                      pendingRaw: '0',
                      totalNotes: 0,
                      spendableNotes: 0,
                      syncState: 'complete',
                      syncedAt: Date.now(),
                    },
                  ],
                },
              };
            case 'plabs_getHistory':
              return {
                items: [
                  {
                    id: 'wallet-history-1',
                    chainId: 143,
                    kind: 'receive',
                    status: 'confirmed',
                    symbol: 'sUSDC',
                    decimals: 6,
                    amountRaw: '5500000',
                    txHash: `0x${'b'.repeat(64)}`,
                    createdAt: Date.now(),
                    source: 'received-note',
                  },
                ],
                page: 1,
                pageSize: 20,
                total: 1,
                pages: 1,
                coverage: 'wallet-and-received-notes',
                syncComplete: true,
              };
            case 'plabs_getNotes':
              return {
                items: [
                  {
                    id: 'c'.repeat(64),
                    poolAddress: pool,
                    symbol: 'sUSDC',
                    decimals: 6,
                    valueRaw: '100000000',
                    confirmed: true,
                    spent: false,
                    txHash: `0x${'b'.repeat(64)}`,
                    blockNumber: 123,
                  },
                ],
                page: 1,
                pageSize: 20,
                total: 1,
                pages: 1,
              };
            case 'plabs_getDexOrders':
              return {
                orders: [
                  {
                    id: 'd'.repeat(32),
                    side: 'sell',
                    type: 'limit',
                    quantityRaw: '120000000000',
                    priceTicks: '1400',
                    createdAt: Date.now(),
                    epoch: 'epoch-1',
                    status: 'open',
                    matchedRaw: '0',
                    pendingRaw: '0',
                    remainingRaw: '120000000000',
                  },
                ],
                source: 'official-matcher',
                importedAt: Date.now(),
                fetchedAt: Date.now(),
                needsImport: false,
                canPlaceOrders: false,
              };
            case 'plabs_revokePrivacyAccess':
              scopes = [];
              for (const cb of listeners.get('privacySessionChanged') ?? []) cb({ revoked: true });
              return null;
            case 'plabs_getPrivacyAddress':
              return { address: `perc1${'a'.repeat(80)}`, chainId: '0x8f' };
            case 'plabs_openWallet':
              return { opened: true };
            case 'wallet_revokePermissions':
              connected = false;
              return null;
            case 'plabs_sendPrivacyTransaction':
              return { id: 'session-operation', state: 'pending' };
            case 'plabs_getTransactionStatus':
              return { id: 'session-operation', state: 'confirmed', txHash: `0x${'2'.repeat(64)}` };
            default:
              throw new Error(`Unexpected wallet request: ${method}`);
          }
        },
        on(event: string, listener: (...args: unknown[]) => void) {
          if (!listeners.has(event)) listeners.set(event, new Set());
          listeners.get(event)?.add(listener);
        },
        removeListener(event: string, listener: (...args: unknown[]) => void) {
          listeners.get(event)?.delete(listener);
        },
      };
      Object.assign(window, {
        plabsPrivacyWallet: provider,
        __walletCalls: calls,
        __switchAccount: () => {
          current = `0x${'3'.repeat(40)}`;
          for (const cb of listeners.get('accountsChanged') ?? []) cb([current]);
        },
      });
    },
    { account, pool, privacyReads },
  );
}
export async function connect(page: Page) {
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).first().click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Connect PLabs Wallet', exact: true })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}

export async function waitForNotifications(page: Page) {
  await page.waitForFunction(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        '.app-notifications [data-sonner-toast]:not([data-removed="true"])',
      ),
    ).every(
      (element) => element.dataset.mounted === 'true' && getComputedStyle(element).opacity === '1',
    ),
  );
}

export async function revokeReadAccess(page: Page) {
  await page.evaluate(() =>
    Reflect.get(window, 'plabsPrivacyWallet').request({ method: 'plabs_revokePrivacyAccess' }),
  );
}
