import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { createServer, loadConfigFromFile } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const account = `0x${'ab'.repeat(20)}`;
const rawAddress = `0x${'12'.repeat(43)}`;
const pool = '0x59df8637654d1ecb090ab7881b703b5a856d2780';
const collector =
  '4449ad291565b82847b77c7d1358898a4094cacef26e518867d1485ef4f8b6656e64b12827bbaa7d357a0d';
const authMessage = 'JubJub LOCAL BROWSER FIXTURE\nSynthetic sign-in; no real signatures or funds.';
const signature = `0x${'aa'.repeat(65)}`;
const proof = {
  version: 'bjj-schnorr-v1',
  r_x_hex: '11'.repeat(32),
  r_y_hex: '22'.repeat(32),
  s_hex: '33'.repeat(32),
};
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
    .join(',')}}`;
}
function profile(now, ended) {
  // The reviewed public deployment is preserved. Only the test schedule changes.
  const rules = {
    auctionOnly: true,
    auctionSeats: 1623,
    chainId: 143,
    custody: {
      asset: 'P20',
      bidStepUnits: '50000000',
      decimals: 6,
      recipientRaw: collector,
      settlement: 'pay-as-bid',
    },
    enabled: true,
    endsAt: ended ? now - 60 : now + 3600,
    id: 'jubjub-p20-browser-fixture',
    market: pool,
    maxContributions: 64,
    maxPositions: 1623,
    paymentPool: pool,
    reserveUnits: '100000000',
    staged: true,
    startsAt: now - 3600,
    title: 'JubJub',
  };
  const rulesHash = `0x${Buffer.from(keccak_256(new TextEncoder().encode(canonical(rules)))).toString('hex')}`;
  return {
    rules,
    rulesHash,
    indexerUrl: 'https://monad-indexer.plabs.online',
    participationLimit: null,
    testnet: false,
    nativeSymbol: 'MON',
    feeSymbol: 'P20',
    collectorRaw: collector,
    secondaryEnabled: false,
    feePolicy: { fixedUnits: '0', marginBps: 0, priceMode: 'sponsored' },
    apiBase: '/nft-jubjub/v1',
    spendChecks: { continuous: false, final: false },
  };
}
function createState(scenario) {
  const now = Math.floor(Date.now() / 1000);
  const ended = scenario === 'refund';
  return {
    scenario,
    now,
    config: profile(now, ended),
    requests: [],
    funding: [],
    intents: ended
      ? [
          {
            id: `0x${'ef'.repeat(32)}`,
            status: 'funded',
            total: '150000000',
            delta: '150000000',
            version: 0,
            createdAt: now - 1000,
          },
        ]
      : [],
    confirmedTotal: ended ? 150000000n : 0n,
    positionVersion: ended ? 1 : 0,
    confirmedTransactions: ended ? 1 : 0,
    refundsRequested: 0,
  };
}
function summary(state) {
  return {
    phase: state.scenario === 'refund' ? 'ended' : 'bidding',
    serverTime: Math.floor(Date.now() / 1000),
    refundOpen: state.scenario === 'refund',
    committedUnits: String(state.confirmedTotal),
    positions: state.confirmedTotal > 0n ? 1 : 0,
    bidTransactions: state.confirmedTransactions,
    snapshotHash: null,
    mergedRoot: null,
    campaignId: state.config.rules.id,
    rulesHash: state.config.rulesHash,
    bidAttempts: state.intents.length,
    participationLimit: null,
    registeredPositions: 1,
    bidPaused: false,
    averageBidUnits: '100000000',
    highestBidUnits: String(state.confirmedTotal > 100000000n ? state.confirmedTotal : 100000000n),
    qualifyingBidUnits: '100000000',
    stage: 'auction',
    auctionSeats: 1623,
    qualificationCount: 0,
    whitelistFrozen: false,
  };
}
function me(state) {
  const ended = state.scenario === 'refund';
  return {
    owner: account,
    position: { version: state.positionVersion },
    intents: state.intents,
    jobs: [],
    summary: summary(state),
    qualification: { rank: ended ? 1700 : null, eligible: ended ? false : null, final: ended },
    custody: { settled: ended, expectedRefundUnits: ended ? '150000000' : '0', refundedUnits: '0' },
  };
}

function injectedProvider() {
  const params = new URLSearchParams(location.search);
  const scenario = params.get('scenario') || 'flow';
  const fixtureId = params.get('fixtureId') || scenario;
  const data = window.__jubjubFixtureData;
  const listeners = new Map();
  const expiresAt = Date.now() + 3600000;
  const rpcCalls = [];
  let currentAccount = data.account;
  let chainId = scenario === 'network' ? '0x1' : '0x8f';
  let unlocked = scenario !== 'locked';
  let releaseSignature;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== location.origin)
      return Promise.reject(new Error('The local fixture blocks external requests.'));
    const headers = new Headers(init?.headers);
    headers.set('X-Jubjub-Fixture-Id', fixtureId);
    headers.set('X-Jubjub-Fixture-Scenario', scenario);
    return nativeFetch(input, { ...init, headers });
  };
  const emit = (event, value) => {
    for (const listener of listeners.get(event) ?? []) listener(value);
  };
  const scopes = ['address', 'balances', 'history', 'notes', 'dexOrders'];
  const privacy = () => ({
    version: 1,
    chainId,
    ...(unlocked ? { address: data.rawAddress, scopes, expiresAt } : { scopes: [] }),
  });
  window.__jubjubFixture = {
    rpcCalls,
    get waitingForSignature() {
      return !!releaseSignature;
    },
    changeAccount() {
      currentAccount = `0x${'cd'.repeat(20)}`;
      emit('accountsChanged', [currentAccount]);
    },
    releaseSignature() {
      releaseSignature?.(data.signature);
      releaseSignature = undefined;
    },
  };
  window.plabsPrivacyWallet = {
    isPlabsWallet: true,
    on(event, listener) {
      const entries = listeners.get(event) ?? new Set();
      entries.add(listener);
      listeners.set(event, entries);
    },
    removeListener(event, listener) {
      listeners.get(event)?.delete(listener);
    },
    async request({ method, params: args = [] }) {
      rpcCalls.push({ method, params: args });
      switch (method) {
        case 'eth_accounts':
        case 'eth_requestAccounts':
          return [currentAccount];
        case 'eth_chainId':
          return chainId;
        case 'plabs_getCapabilities':
          return {
            version: 1,
            methods: {
              personalSign: true,
              privacyRead: true,
              privacyOwnership: true,
              jubjubBidding: scenario !== 'old',
              unifiedConnect: true,
            },
            networks: [
              { chainId: 143, name: 'Monad', nativeSymbol: 'MON', pools: [] },
              { chainId: 1, name: 'Ethereum', nativeSymbol: 'ETH', pools: [] },
            ],
          };
        case 'plabs_getPrivacySession':
          return privacy();
        case 'plabs_requestPrivacyAccess':
          unlocked = true;
          return privacy();
        case 'plabs_connect':
          unlocked = true;
          return { accounts: [currentAccount], chainId, privacy: privacy() };
        case 'plabs_getPrivacyAddress':
          return { address: data.rawAddress, rawAddress: data.rawAddress, chainId };
        case 'plabs_getBalances':
          return {
            chainId,
            privacyAddress: data.rawAddress,
            fetchedAt: Date.now(),
            public: { assets: [] },
            private: { assets: [] },
          };
        case 'plabs_getHistory':
        case 'plabs_getNotes':
          return { items: [], page: 1, pageSize: 20, total: 0, pages: 1 };
        case 'plabs_getDexOrders':
          return { orders: [], fetchedAt: Date.now() };
        case 'wallet_switchEthereumChain':
          chainId = args[0].chainId;
          emit('chainChanged', chainId);
          return null;
        case 'plabs_openWallet':
          return { opened: true };
        case 'personal_sign': {
          const message = new TextDecoder().decode(
            Uint8Array.from(args[0].slice(2).match(/../g), (hex) => Number.parseInt(hex, 16)),
          );
          if (message !== data.authMessage || args[1] !== currentAccount)
            throw new Error('Unexpected fixture sign-in message.');
          if (scenario === 'reject') throw { code: 4001, message: 'User rejected' };
          if (scenario === 'stale')
            return new Promise((accept) => {
              releaseSignature = accept;
            });
          return data.signature;
        }
        case 'plabs_provePrivacyOwnership':
          if (args[0].message !== data.authMessage || args[0].privacyAddress !== data.rawAddress)
            throw new Error('Unexpected fixture privacy proof request.');
          return data.proof;
        case 'plabs_fundJubjubBid': {
          if (scenario === 'old')
            throw new Error('This fixture extension does not support JubJub.');
          if (Object.keys(args[0]).sort().join(',') !== 'intentId,token')
            throw new Error('The site supplied unexpected funding material.');
          const response = await fetch('/__jubjub_fixture/fund', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(args[0]),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          return result;
        }
        default:
          throw new Error(`Unexpected fixture RPC: ${method}`);
      }
    },
  };
  window.addEventListener('DOMContentLoaded', () => {
    const banner = document.createElement('div');
    banner.textContent = `JUBJUB TEST FIXTURE · ${scenario} · synthetic wallet, signatures and funds`;
    banner.style.cssText =
      'background:#edbb76;color:#111;padding:8px;text-align:center;position:relative;z-index:9999';
    document.body.prepend(banner);
  });
}

export async function createJubjubFixtureServer({ port = 5182 } = {}) {
  const states = new Map();
  const loaded = await loadConfigFromFile(
    { command: 'serve', mode: 'development' },
    undefined,
    root,
  );
  const config = loaded.config;
  config.root = root;
  config.configFile = false;
  config.logLevel = 'warn';
  config.server = { host: '127.0.0.1', port, strictPort: true, proxy: {} };
  config.define = {
    ...config.define,
    'import.meta.env.VITE_JUBJUB_API': JSON.stringify('/api/jubjub'),
    'import.meta.env.VITE_PLATFORM_API': JSON.stringify('/api/platform'),
  };
  config.plugins.push({
    name: 'jubjub-test-only',
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          children: `window.__jubjubFixtureData=${JSON.stringify({ account, rawAddress, signature, proof, authMessage })};(${injectedProvider.toString()})();`,
          injectTo: 'head-prepend',
        },
      ];
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url.startsWith('/api/') && !req.url.startsWith('/__jubjub_fixture/'))
          return next();
        const id = String(req.headers['x-jubjub-fixture-id'] ?? 'flow');
        const scenario = String(req.headers['x-jubjub-fixture-scenario'] ?? 'flow');
        const state = states.get(id) ?? createState(scenario);
        states.set(id, state);
        let text = '';
        req.on('data', (chunk) => {
          text += chunk;
        });
        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          try {
            const body = text ? JSON.parse(text) : undefined;
            const url = new URL(req.url, 'http://fixture.local');
            state.requests.push({
              method: req.method,
              path: url.pathname,
              body,
              token: req.headers.authorization,
            });
            const authenticated = () =>
              assert.equal(req.headers.authorization, `Bearer synthetic-${id}`);
            let result;
            switch (url.pathname) {
              case '/api/platform/wallet/stats':
                result = { privacy_wallet_users: 100 };
                break;
              case '/api/jubjub/config':
                result = state.config;
                break;
              case '/api/jubjub/summary':
                result = summary(state);
                break;
              case '/api/jubjub/history': {
                const rows = Array.from({ length: 3 }, (_, sequence) => ({
                  at: state.now - 120 + sequence * 30,
                  sequence,
                  committedUnits: String(sequence * 100000000),
                  positions: sequence,
                  averageBidUnits: String(100000000 + sequence * 5000000),
                  averageVersion: 2,
                  highestBidUnits: String(100000000 + sequence * 50000000),
                  qualifyingBidUnits: '100000000',
                }));
                const after = Number(url.searchParams.get('after') ?? 0);
                result = {
                  campaignId: state.config.rules.id,
                  rulesHash: state.config.rulesHash,
                  rows: rows.filter((row) => row.sequence >= after),
                  cursor: rows.length,
                  more: false,
                };
                break;
              }
              case '/api/jubjub/auth/challenge':
                assert.match(body.evm, /^0x[0-9a-f]{40}$/);
                assert.equal(body.raw, rawAddress.slice(2));
                result = { id: `challenge-${id}`, message: authMessage };
                break;
              case '/api/jubjub/auth/session':
                assert.deepEqual(body, { id: `challenge-${id}`, signature, proof });
                result = {
                  token: `synthetic-${id}`,
                  expires: Math.floor(Date.now() / 1000) + 3600,
                };
                break;
              case '/api/jubjub/me':
                authenticated();
                result = me(state);
                break;
              case '/api/jubjub/bids/prepare': {
                authenticated();
                assert.equal(req.method, 'POST');
                assert.match(body.id, /^0x[0-9a-f]{64}$/);
                const saved = state.intents.find((intent) => intent.id === body.id);
                if (saved) {
                  assert.equal(saved.total, body.total);
                  assert.equal(saved.version, body.version);
                  result = saved;
                  break;
                }
                assert.equal(
                  state.intents.some((intent) => intent.status === 'prepared'),
                  false,
                  'Cannot create another payment while the original is pending',
                );
                assert.equal(body.version, state.positionVersion);
                const total = BigInt(body.total);
                assert.ok(
                  total >= 100000000n &&
                    total % 50000000n === 0n &&
                    total - state.confirmedTotal >= 50000000n,
                );
                result = {
                  ...body,
                  status: 'prepared',
                  delta: String(total - state.confirmedTotal),
                  createdAt: Math.floor(Date.now() / 1000),
                };
                state.intents.push(result);
                break;
              }
              case '/__jubjub_fixture/fund': {
                assert.equal(body.token, `synthetic-${id}`);
                const intent = state.intents.find((item) => item.id === body.intentId);
                assert.ok(intent, 'Missing prepared intent');
                state.funding.push({
                  intentId: intent.id,
                  total: intent.total,
                  delta: intent.delta,
                });
                const pending = state.funding.length === 1;
                if (!pending && intent.status !== 'funded') {
                  intent.status = 'funded';
                  state.confirmedTotal = BigInt(intent.total);
                  state.positionVersion += 1;
                  state.confirmedTransactions += 1;
                }
                result = {
                  intentId: intent.id,
                  state: pending ? 'pending' : 'confirmed',
                  txHash: `0x${'cd'.repeat(32)}`,
                  ...(pending
                    ? {
                        message:
                          'Your bid is pending. Resume the saved payment; no second payment is needed.',
                      }
                    : {}),
                };
                break;
              }
              case '/api/jubjub/refund':
                authenticated();
                assert.equal(state.scenario, 'refund');
                assert.deepEqual(body, {});
                state.refundsRequested++;
                result = {
                  refundsReleased: true,
                  settled: true,
                  refundableUnits: '150000000',
                  refundedUnits: '0',
                  chargedUnits: '0',
                };
                break;
              default:
                throw new Error(`Unexpected local API request: ${url.pathname}`);
            }
            res.end(JSON.stringify(result));
          } catch (error) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: error.message }));
          }
        });
      });
    },
  });
  const server = await createServer(config);
  await server.listen();
  return {
    url: `http://127.0.0.1:${server.httpServer.address().port}`,
    state: (id) => states.get(id),
    close: () => server.close(),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createJubjubFixtureServer({
    port: Number(process.env.JUBJUB_FIXTURE_PORT ?? 5182),
  });
  console.log(`Synthetic JubJub fixture: ${server.url}/privasea/jubjub`);
  console.log('Scenarios: ?scenario=flow|refund|reject|network|stale|old|locked');
}
