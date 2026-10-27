import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { createServer, loadConfigFromFile } from 'vite';

const require = createRequire(import.meta.url);
const candidates = [
  process.env.JUBJUB_PLAYWRIGHT_PATH,
  join(homedir(), 'Workspace/ai/rea/node_modules/playwright-core/index.mjs'),
];
try {
  candidates.unshift(require.resolve('playwright-core'));
} catch {
  /* Use an installed tool runtime. */
}
const playwrightPath = candidates.find((path) => path && existsSync(path));
if (!playwrightPath)
  throw new Error('Set JUBJUB_PLAYWRIGHT_PATH to an existing playwright-core installation.');
const { chromium } = await import(pathToFileURL(resolve(playwrightPath)).href);
const executablePath = [
  process.env.JUBJUB_BROWSER_PATH,
  chromium.executablePath(),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((path) => path && existsSync(path));
const artifactDir = process.env.NFT_ARTIFACT_DIR ?? join(tmpdir(), 'plabs-nft-browser');
await mkdir(artifactDir, { recursive: true });
const { config } = await loadConfigFromFile({ command: 'serve', mode: 'development' });
const server = await createServer({
  ...config,
  configFile: false,
  server: { host: '127.0.0.1', port: 0, proxy: {} },
});
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath });
const pool = `0x${'56'.repeat(20)}`,
  creator = `0x${'78'.repeat(20)}`,
  raw = `0x${'12'.repeat(43)}`,
  account = `0x${'34'.repeat(20)}`;
const market = '0x48269ee92a420fb1ba3db94a1593c233fa33068e';
const uint = (n) => BigInt(n).toString(16).padStart(64, '0');
const text = (s) =>
  '0x' +
  uint(32) +
  uint(Buffer.byteLength(s)) +
  Buffer.from(s)
    .toString('hex')
    .padEnd(Math.ceil(Buffer.byteLength(s) / 32) * 64, '0');
const sig = (s) =>
  '0x' +
  Buffer.from(keccak_256(new TextEncoder().encode(s)))
    .toString('hex')
    .slice(0, 8);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const image = readFileSync(new URL('../../public/assets/nft-0.png', import.meta.url));
const imageHash = digest(image),
  imageUrl = `https://media.plabs.online/objects/${imageHash}.webp`;
const entry = {
  name: 'Fixture birds',
  symbol: 'BIRD',
  image: imageUrl,
  image_sha256: imageHash,
  thumbnail: imageUrl,
  thumbnail_sha256: imageHash,
};
const manifest = Buffer.from(
  JSON.stringify({
    chainId: 1,
    creator,
    collection: entry,
    tokens: { 1: entry, 2: entry, 3: entry, 4: entry, 5: entry },
  }),
);
const commitment = digest(manifest);
const replies = Object.fromEntries(
  Object.entries({
    'poolCount()': `0x${uint(1)}`,
    'pools(uint256)': `0x${uint(pool)}`,
    'launches(address)': `0x${[creator, 0, 0, 0, 1700000000, 0, 0, 0, 1, 0, 5, 2].map(uint).join('')}`,
    'name()': text('Fixture birds'),
    'symbol()': text('BIRD'),
    'metadataBaseURI()': text(`https://media.plabs.online/collections/${commitment}`),
    'metadataManifestHash()': `0x${commitment}`,
  }).map(([name, value]) => [sig(name), value]),
);
const proof = {
  version: 'bjj-schnorr-v1',
  r_x_hex: '11'.repeat(32),
  r_y_hex: '22'.repeat(32),
  s_hex: '33'.repeat(32),
};
const allocation = {
  enabled: true,
  connected: true,
  checked: true,
  eligible: true,
  allowance: 3,
  minted: 1,
  reserved: 0,
  remaining: 2,
};
let passes = 0;
async function run(name, scenario, check, viewport = { width: 1440, height: 1100 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const calls = [],
    errors = [],
    external = [];
  let minted = 2,
    statusError = scenario === 'status-error';
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(
    ({ raw, account, proof, scenario, pool }) => {
      let evm = account,
        chain = scenario === 'network' ? 143 : 1,
        unlocked = scenario !== 'locked';
      let mints = JSON.parse(sessionStorage.getItem('synthetic-nft-mints') || '[]');
      const saveMints = () => sessionStorage.setItem('synthetic-nft-mints', JSON.stringify(mints));
      const listeners = new Map(),
        scopes = ['address', 'balances', 'history', 'notes', 'dexOrders'];
      let release;
      const pending = new Promise((resolve) => {
        release = resolve;
      });
      window.__nftFixture = {
        calls: [],
        changeAccount() {
          evm = `0x${'90'.repeat(20)}`;
          for (const fn of listeners.get('accountsChanged') ?? []) fn([evm]);
        },
        release() {
          release();
        },
      };
      const provider = {
        isPlabsWallet: true,
        on(name, fn) {
          listeners.set(name, [...(listeners.get(name) ?? []), fn]);
        },
        removeListener(name, fn) {
          listeners.set(
            name,
            (listeners.get(name) ?? []).filter((f) => f !== fn),
          );
        },
        async request({ method, params }) {
          window.__nftFixture.calls.push({ method, params });
          const privacy = () => ({
            version: 1,
            chainId: `0x${chain.toString(16)}`,
            ...(unlocked
              ? { address: raw, scopes, expiresAt: Date.now() + 3600000 }
              : { scopes: [] }),
          });
          switch (method) {
            case 'eth_accounts':
              return [evm];
            case 'eth_chainId':
              return `0x${chain.toString(16)}`;
            case 'plabs_getCapabilities':
              return {
                version: 1,
                methods: {
                  privacyRead: true,
                  privacyOwnership: true,
                  personalSign: true,
                  nftMinting: scenario.startsWith('mint'),
                },
                networks: [
                  { chainId: 1, name: 'Ethereum', nativeSymbol: 'ETH', pools: [] },
                  { chainId: 143, name: 'Monad', nativeSymbol: 'MON', pools: [] },
                ],
              };
            case 'plabs_getPrivacySession':
              return privacy();
            case 'plabs_requestPrivacyAccess':
              unlocked = true;
              return privacy();
            case 'plabs_getPrivacyAddress':
              return { address: raw, rawAddress: raw, chainId: `0x${chain.toString(16)}` };
            case 'plabs_getBalances':
              return {
                chainId: `0x${chain.toString(16)}`,
                privacyAddress: raw,
                fetchedAt: Date.now(),
                public: { assets: [] },
                private: { assets: [] },
              };
            case 'plabs_getHistory':
            case 'plabs_getNotes':
              return { items: [], page: 1, pageSize: 20, total: 0, pages: 1 };
            case 'plabs_getNftMints':
              return evm === account ? mints : [];
            case 'plabs_mintNft': {
              if (params[0].chainId !== 1 || params[0].poolAddress !== pool)
                throw new Error('Unexpected mint intent');
              const mint = {
                id: '12345678-1234-4234-8234-123456789012',
                chainId: 1,
                poolAddress: pool,
                name: 'Fixture birds',
                symbol: 'BIRD',
                tokenId: '7',
                state: 'pending',
                stage: scenario === 'mint-reject' ? 'approval' : 'confirming',
                canResume: true,
                createdAt: Date.now(),
                ...(scenario === 'mint-reject'
                  ? { message: 'User rejected transaction; original proof saved' }
                  : { txHash: `0x${'ab'.repeat(32)}` }),
              };
              mints = [mint];
              saveMints();
              return mint;
            }
            case 'plabs_resumeNftMint': {
              if (params[0] !== mints[0]?.id) throw new Error('Unexpected recovery ID');
              mints[0] = {
                ...mints[0],
                state: 'confirmed',
                stage: 'confirmed',
                canResume: false,
                txHash: `0x${'ab'.repeat(32)}`,
                message: 'NFT #7 confirmed; private note retained in wallet',
              };
              saveMints();
              return mints[0];
            }
            case 'plabs_getDexOrders':
              return { orders: [], fetchedAt: Date.now() };
            case 'plabs_provePrivacyOwnership':
              if (scenario === 'reject')
                throw { code: 4001, message: 'User rejected ownership proof' };
              if (scenario === 'stale') await pending;
              return proof;
            case 'wallet_switchEthereumChain':
              chain = Number.parseInt(params[0].chainId, 16);
              for (const fn of listeners.get('chainChanged') ?? []) fn(`0x${chain.toString(16)}`);
              return null;
            default:
              throw new Error(`Unexpected fixture RPC: ${method}`);
          }
        },
      };
      window.plabsPrivacyWallet = provider;
    },
    { raw, account, proof, scenario, pool },
  );
  await context.route('**/*', async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    const fulfill = (body, status = 200, contentType = 'application/json') =>
      route.fulfill({
        status,
        contentType,
        body: Buffer.isBuffer(body) ? body : JSON.stringify(body),
      });
    if (['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'].includes(url.origin)) {
      const call = req.postDataJSON();
      calls.push(call);
      return fulfill({
        id: 1,
        result:
          call.method === 'eth_chainId'
            ? '0x1'
            : call.method === 'eth_blockNumber'
              ? '0x123456'
              : replies[call.params[0].data.slice(0, 10)],
      });
    }
    if (url.origin !== origin) {
      external.push(req.url());
      return route.abort();
    }
    if (url.pathname.startsWith('/api/nft-media/'))
      return fulfill(
        url.pathname.endsWith('manifest.json') ? manifest : image,
        200,
        url.pathname.endsWith('manifest.json') ? 'application/json' : 'image/png',
      );
    if (url.pathname.startsWith('/api/nft/pool/'))
      return fulfill(
        statusError
          ? { error: 'synthetic outage' }
          : {
              pool,
              supply: 5,
              minted,
              reserved: 0,
              remaining: 5 - minted,
              soldOut: minted === 5,
              primaryOpen: true,
              registered: true,
              asOf: Date.now(),
              stale: false,
              whitelist: {
                ...allocation,
                connected: false,
                checked: false,
                eligible: false,
                remaining: 0,
              },
              bidCount: 0,
              average: null,
            },
        statusError ? 503 : 200,
      );
    if (url.pathname === '/api/nft/whitelist/check') {
      const body = req.postDataJSON();
      calls.push({ check: body });
      assert.equal(body.pool, pool);
      assert.equal(
        body.wallet,
        `0x${Buffer.from(keccak_256(Buffer.from(raw.slice(2), 'hex'))).toString('hex')}`,
      );
      assert.equal(body.authorization.rawAddressHex, raw.slice(2));
      assert.deepEqual(body.authorization.proof, proof);
      return fulfill({
        ok: true,
        accessToken: 'synthetic-access-token',
        whitelist:
          scenario === 'ineligible' ? { ...allocation, eligible: false, remaining: 0 } : allocation,
      });
    }
    if (url.pathname.startsWith('/api/')) return fulfill({});
    return route.continue();
  });
  try {
    await page.goto(`${origin}/privasea/launch`);
    await page.getByRole('heading', { name: 'Fixture birds', exact: true }).waitFor();
    await page.getByAltText('Fixture birds collection artwork').waitFor();
    await check(page, {
      calls,
      setMinted: (value) => {
        minted = value;
      },
      restoreStatus: () => {
        statusError = false;
      },
    });
    assert.deepEqual(errors, [], 'No browser runtime errors');
    assert.deepEqual(external, [], 'No real external requests');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      'No horizontal overflow',
    );
    passes++;
    console.log(`PASS ${name}`);
  } catch (error) {
    await page.screenshot({ path: join(artifactDir, `${name}-failed.png`), fullPage: true });
    console.error(await page.locator('body').innerText());
    throw error;
  } finally {
    await context.close();
  }
}
try {
  await run('catalog-allocation-search-details', 'normal', async (page, { calls }) => {
    await page.getByRole('button', { name: 'Check allocation', exact: true }).click();
    await page.getByText('2 mints available', { exact: true }).waitFor();
    const walletCalls = await page.evaluate(() => window.__nftFixture.calls);
    const ownership = walletCalls.find((c) => c.method === 'plabs_provePrivacyOwnership');
    assert.ok(
      ownership.params[0].message.startsWith(
        `PrivaSea allowlist eligibility check only\nChain ID: 1\nMarket: ${market}`,
      ),
    );
    assert.equal(
      walletCalls.some((c) => ['personal_sign', 'eth_sendTransaction'].includes(c.method)),
      false,
    );
    assert.equal(calls.filter((c) => c.check).length, 1);
    await page.screenshot({ path: join(artifactDir, 'allocation-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'View Fixture birds', exact: true }).click();
    await page.getByRole('dialog', { name: 'Fixture birds' }).waitFor();
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.getByRole('searchbox', { name: 'Search NFT collections' }).fill('missing');
    await page.getByRole('heading', { name: 'No matching collections' }).waitFor();
    await page.getByRole('searchbox', { name: 'Search NFT collections' }).fill('BIRD');
    await page.getByRole('heading', { name: 'Fixture birds', exact: true }).waitFor();
    assert.equal(
      await page.getByRole('link', { name: 'View on PLabs', exact: true }).getAttribute('href'),
      `https://app.plabs.online/privasea/collection/${pool}`,
    );
  });
  await run(
    'mobile-unlock-and-continue',
    'locked',
    async (page) => {
      await page.getByRole('button', { name: 'Unlock and check allocation', exact: true }).click();
      await page.getByText('2 mints available', { exact: true }).waitFor();
      await page.screenshot({ path: join(artifactDir, 'allocation-mobile.png'), fullPage: true });
      await page.evaluate(() => window.__nftFixture.changeAccount());
      await page.getByRole('button', { name: 'Check allocation', exact: true }).waitFor();
      assert.equal(await page.getByText('2 mints available', { exact: true }).count(), 0);
    },
    { width: 390, height: 844 },
  );
  await run('rejected-proof', 'reject', async (page, { calls }) => {
    await page.getByRole('button', { name: 'Check allocation', exact: true }).click();
    await page
      .getByRole('alert')
      .filter({ hasText: /declined|rejected/i })
      .waitFor();
    assert.equal(
      calls.some((c) => c.check),
      false,
    );
  });
  await run('stale-wallet-proof', 'stale', async (page, { calls }) => {
    await page.getByRole('button', { name: 'Check allocation', exact: true }).click();
    await page.getByText('Approve ownership proof in PLabs Wallet…', { exact: true }).waitFor();
    await page.evaluate(() => {
      window.__nftFixture.changeAccount();
      window.__nftFixture.release();
    });
    await page.getByRole('button', { name: 'Check allocation', exact: true }).waitFor();
    assert.equal(
      calls.some((c) => c.check),
      false,
    );
  });
  await run('explicit-network-switch', 'network', async (page) => {
    await page.getByRole('button', { name: 'Switch to Ethereum', exact: true }).click();
    await page.getByRole('button', { name: 'Check allocation', exact: true }).click();
    await page.getByText('2 mints available', { exact: true }).waitFor();
  });
  await run(
    'status-outage-retry-and-live-update',
    'status-error',
    async (page, { restoreStatus, setMinted }) => {
      await page
        .getByText('Live status unavailable · showing on-chain snapshot', { exact: true })
        .waitFor();
      restoreStatus();
      setMinted(5);
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await page.getByText('MINTED OUT', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Mint NFT', exact: true }).count(), 0);
      await page.getByRole('link', { name: 'View on PLabs', exact: true }).waitFor();
    },
  );
  await run('native-mint-reload-and-recover', 'mint', async (page) => {
    await page.getByRole('button', { name: 'Mint NFT', exact: true }).click();
    await page.getByRole('button', { name: 'Check mint status', exact: true }).waitFor();
    assert.equal(
      await page.evaluate(
        () => window.__nftFixture.calls.filter((call) => call.method === 'plabs_mintNft').length,
      ),
      1,
    );
    await page.reload();
    await page.getByRole('button', { name: 'Check mint status', exact: true }).click();
    await page.getByText('Mint confirmed · #7', { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(
        () => window.__nftFixture.calls.filter((call) => call.method === 'plabs_mintNft').length,
      ),
      0,
    );
    assert.equal(
      await page.evaluate(
        () =>
          window.__nftFixture.calls.filter((call) => call.method === 'plabs_resumeNftMint').length,
      ),
      1,
    );
    await page.screenshot({ path: join(artifactDir, 'native-mint-confirmed.png'), fullPage: true });
  });
  await run(
    'native-mint-rejected-transaction-resumes-same-request',
    'mint-reject',
    async (page) => {
      await page.getByRole('button', { name: 'Mint NFT', exact: true }).click();
      await page.getByRole('button', { name: 'Resume mint', exact: true }).click();
      await page.getByText('Mint confirmed · #7', { exact: true }).waitFor();
      assert.equal(
        await page.evaluate(
          () => window.__nftFixture.calls.filter((call) => call.method === 'plabs_mintNft').length,
        ),
        1,
      );
      await page.evaluate(() => window.__nftFixture.changeAccount());
      await page.getByRole('button', { name: 'Mint NFT', exact: true }).waitFor();
      assert.equal(await page.getByText('Mint confirmed · #7', { exact: true }).count(), 0);
      await page.screenshot({ path: join(artifactDir, 'native-mint-mobile.png'), fullPage: true });
    },
    { width: 390, height: 844 },
  );
  console.log(`${passes} NFT Launch browser cases passed. Screenshots: ${artifactDir}`);
} finally {
  await browser.close();
  await server.close();
}
