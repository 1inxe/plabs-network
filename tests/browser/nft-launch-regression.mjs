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
  const editionCount = scenario === 'pages' ? 49 : 5;
  const activeManifest =
    editionCount === 5
      ? manifest
      : Buffer.from(
          JSON.stringify({
            chainId: 1,
            creator,
            collection: entry,
            tokens: Object.fromEntries(
              Array.from({ length: editionCount }, (_, i) => [String(i + 1), entry]),
            ),
          }),
        );
  const activeCommitment = digest(activeManifest);
  const activeReplies = {
    ...replies,
    [sig('launches(address)')]:
      `0x${[creator, 0, 0, 0, 1700000000, 0, 0, 0, 1, 0, editionCount, 2].map(uint).join('')}`,
    [sig('metadataBaseURI()')]: text(`https://media.plabs.online/collections/${activeCommitment}`),
    [sig('metadataManifestHash()')]: `0x${activeCommitment}`,
  };
  const calls = [],
    errors = [],
    external = [];
  let minted = 2,
    statusError = scenario === 'status-error',
    transientFailures = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(
    ({ raw, account, proof, scenario, pool }) => {
      let evm = account,
        chain = scenario === 'network' ? 143 : 1,
        unlocked = scenario !== 'locked',
        mintSupported = scenario.startsWith('mint');
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
        enableMinting() {
          mintSupported = true;
        },
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
                  nftMinting: mintSupported,
                  nftAssets: scenario.startsWith('profile'),
                },
                networks: [
                  { chainId: 1, name: 'Ethereum', nativeSymbol: 'ETH', pools: [] },
                  { chainId: 143, name: 'Monad', nativeSymbol: 'MON', pools: [] },
                ],
              };
            case 'plabs_getPrivacySession':
              return privacy();
            case 'plabs_requestPrivacyAccess':
              for (const scope of params[0].scopes) if (!scopes.includes(scope)) scopes.push(scope);
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
            case 'plabs_getNftAssets':
              if (!scopes.includes('nfts')) throw new Error('NFT consent is required');
              if (scenario === 'profile-race') await pending;
              return {
                chainId: 1,
                items:
                  evm === account
                    ? [
                        {
                          id: 'synthetic-received',
                          poolAddress: pool,
                          name: 'Fixture birds',
                          symbol: 'BIRD',
                          tokenId: '3',
                          state: 'confirmed',
                        },
                      ]
                    : [],
                syncedAt: Date.now(),
                syncComplete: true,
              };
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
      if (call.method === 'eth_getBlockByNumber')
        return fulfill({ id: 1, result: { number: '0x123456', hash: `0x${'ab'.repeat(32)}` } });
      if (
        call.method === 'eth_call' &&
        call.params[0].data.startsWith(sig('issuedTokenIds(uint256,uint256)'))
      ) {
        if (scenario === 'stale-index') return fulfill({ error: 'synthetic chain outage' }, 503);
        const first = Number(BigInt(`0x${call.params[0].data.slice(10, 74)}`)),
          size = Number(BigInt(`0x${call.params[0].data.slice(74, 138)}`));
        const ids = [1, 3].filter((id) => id >= first && id < first + size);
        return fulfill({ id: 1, result: `0x${[32, ids.length, ...ids].map(uint).join('')}` });
      }
      return fulfill({
        id: 1,
        result:
          call.method === 'eth_chainId'
            ? '0x1'
            : call.method === 'eth_blockNumber'
              ? '0x123456'
              : activeReplies[call.params[0].data.slice(0, 10)],
      });
    }
    if (url.origin !== origin) {
      external.push(req.url());
      return route.abort();
    }
    if (url.pathname.startsWith('/api/nft-media/'))
      return fulfill(
        url.pathname.endsWith('manifest.json') ? activeManifest : image,
        200,
        url.pathname.endsWith('manifest.json') ? 'application/json' : 'image/png',
      );
    if (url.pathname.startsWith('/api/nft/pool/')) {
      calls.push({ poolStatus: statusError || transientFailures > 0 ? 503 : 200 });
      if (transientFailures > 0) {
        transientFailures--;
        return fulfill({ error: 'synthetic transient outage' }, 503);
      }
      return fulfill(
        statusError
          ? { error: 'synthetic outage' }
          : {
              pool,
              supply: editionCount,
              minted,
              reserved: 0,
              remaining: editionCount - minted,
              soldOut: minted === 5,
              primaryOpen: true,
              registered: true,
              asOf: Date.now(),
              stale: scenario === 'stale-index',
              mints: [
                {
                  tokenId: '1',
                  mintTxHash: `0x${'ab'.repeat(32)}`,
                  mintCmx: `0x${'cd'.repeat(32)}`,
                },
                { tokenId: '3', mintTxHash: `0x${'ef'.repeat(32)}` },
              ],
              listings: [],
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
    }
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
      failNextStatus: () => {
        transientFailures = 1;
      },
      failStatus: () => {
        statusError = true;
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
    await page.getByRole('link', { name: 'View Fixture birds', exact: true }).click();
    await page.getByRole('heading', { name: 'Fixture birds', level: 1 }).waitFor();
    await page.getByRole('link', { name: 'All launches', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search NFT collections' }).fill('missing');
    await page.getByRole('heading', { name: 'No matching collections' }).waitFor();
    await page.getByRole('searchbox', { name: 'Search NFT collections' }).fill('BIRD');
    await page.getByRole('heading', { name: 'Fixture birds', exact: true }).waitFor();
    assert.equal(
      await page.getByRole('link', { name: 'View collection', exact: true }).getAttribute('href'),
      `/privasea/collection/${pool}`,
    );
  });
  await run('native-collection-and-item-deep-links', 'normal', async (page, { calls }) => {
    await page.goto(`${origin}/privasea/collection/${pool}`);
    await page.getByRole('heading', { name: 'Fixture birds', level: 1 }).waitFor();
    const items = page.getByRole('region', { name: 'Collection items' });
    await items.locator('.nft-item-card').getByText('Unminted', { exact: true }).first().waitFor();
    assert.equal(await items.locator('.nft-item-card').count(), 5);
    assert.equal(
      await items.locator('.nft-item-card').filter({ hasText: '#2' }).innerText(),
      '#2\nUnminted',
    );
    await items.getByRole('link').first().click();
    await page.getByRole('heading', { name: 'BIRD #1', level: 1 }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: 'BIRD #1', level: 1 }).waitFor();
    await page.getByRole('link', { name: /0xabab/ }).waitFor();
    assert.equal(await page.locator('a[href*="app.plabs.online"]').count(), 0);
    await page.screenshot({ path: join(artifactDir, 'native-piece-desktop.png'), fullPage: true });
    await page.goto(`${origin}/privasea/collection/${pool}/999`);
    await page.getByRole('heading', { name: 'NFT not found' }).waitFor();
    assert.ok(calls.some((c) => c.method === 'eth_call'));
  });
  await run('collection-pagination-and-back-state', 'pages', async (page) => {
    await page.goto(`${origin}/privasea/collection/${pool}`);
    await page.getByRole('heading', { name: 'Fixture birds', level: 1 }).waitFor();
    await page
      .getByRole('navigation', { name: 'Collection pages' })
      .getByRole('button', { name: 'Next' })
      .click();
    const item = page.locator('.nft-item-card').first();
    await item.getByText('#25', { exact: true }).waitFor();
    await item.click();
    await page.getByRole('heading', { name: 'BIRD #25' }).waitFor();
    await page.getByRole('link', { name: 'Fixture birds', exact: true }).click();
    await page.locator('.nft-item-card').first().getByText('#25', { exact: true }).waitFor();
    await page.getByRole('searchbox', { name: 'Search token ID' }).fill('49');
    await page.locator('.nft-item-card').first().getByText('#49', { exact: true }).waitFor();
    await page.getByRole('tab', { name: /Activity/ }).click();
    await page.getByRole('region', { name: 'Mint activity' }).getByText('BIRD #3').waitFor();
  });
  await run('stale-index-never-claims-unminted', 'stale-index', async (page) => {
    await page.goto(`${origin}/privasea/collection/${pool}`);
    await page.getByText(/Ethereum mint identities could not be checked/).waitFor();
    assert.equal(
      await page.locator('.nft-item-card').getByText('Unminted', { exact: true }).count(),
      0,
    );
    await page.goto(`${origin}/privasea/collection/${pool}/2`);
    await page.getByText('Mint status unavailable', { exact: true }).waitFor();
  });
  await run(
    'native-outer-navigation-mobile',
    'normal',
    async (page) => {
      for (const [label, title] of [
        ['Home', 'Art for everyone.'],
        ['Market', 'Discover the collection.'],
        ['Create', 'Create a private collection.'],
        ['Profile', 'Your NFTs. Your privacy.'],
      ]) {
        await page
          .getByRole('navigation', { name: 'PrivaSea navigation' })
          .getByRole('link', { name: label, exact: true })
          .click();
        await page
          .getByRole('heading', { name: new RegExp(title.replaceAll('.', '\\.')) })
          .waitFor();
        assert.equal(new URL(page.url()).origin, origin);
        assert.equal(await page.locator('a[href*="app.plabs.online"]').count(), 0);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
      }
      await page.goto(`${origin}/privasea/collection/${pool}`);
      await page.getByRole('heading', { name: 'Fixture birds', level: 1 }).waitFor();
      await page.getByAltText('Fixture birds #1', { exact: true }).waitFor();
      await page.screenshot({
        path: join(artifactDir, 'native-collection-mobile.png'),
        fullPage: true,
      });
    },
    { width: 390, height: 844 },
  );
  await run(
    'profile-explicit-consent-received-assets-and-account-change',
    'profile',
    async (page) => {
      await page.goto(`${origin}/privasea/profile`);
      await page.getByRole('button', { name: 'Allow NFT access' }).waitFor();
      assert.equal(
        (await page.evaluate(() => window.__nftFixture.calls)).some(
          (c) => c.method === 'plabs_getNftAssets',
        ),
        false,
      );
      await page.getByRole('button', { name: 'Allow NFT access' }).click();
      await page
        .getByRole('region', { name: 'My private NFTs' })
        .getByText('Fixture birds #3')
        .waitFor();
      await page.getByRole('button', { name: 'Sync wallet NFTs' }).click();
      await page.getByRole('button', { name: 'Sync wallet NFTs' }).waitFor();
      assert.ok(
        (await page.evaluate(() => window.__nftFixture.calls)).some(
          (c) => c.method === 'plabs_getNftAssets' && c.params[0].sync === true,
        ),
      );
      await page.screenshot({
        path: join(artifactDir, 'native-profile-desktop.png'),
        fullPage: true,
      });
      await page.evaluate(() => window.__nftFixture.changeAccount());
      await page.getByRole('heading', { name: 'No NFTs held by this wallet' }).waitFor();
      assert.equal(await page.getByText('Fixture birds #3').count(), 0);
    },
  );
  await run(
    'profile-stale-read-does-not-disclose-previous-wallet',
    'profile-race',
    async (page) => {
      await page.goto(`${origin}/privasea/profile`);
      await page.getByRole('button', { name: 'Allow NFT access' }).click();
      await page.getByText('Reading wallet NFTs…').waitFor();
      await page.evaluate(() => {
        window.__nftFixture.changeAccount();
        window.__nftFixture.release();
      });
      await page.getByRole('heading', { name: 'No NFTs held by this wallet' }).waitFor();
      assert.equal(await page.getByText('Fixture birds #3').count(), 0);
    },
  );
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
      await page.getByRole('link', { name: 'View collection', exact: true }).waitFor();
    },
  );
  await run(
    'wallet-upgrade-rechecks-live-capabilities-without-reconnecting',
    'upgrade',
    async (page) => {
      await page.getByRole('button', { name: 'Check wallet again' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Mint NFT', exact: true }).count(), 0);
      await page.evaluate(() => window.__nftFixture.enableMinting());
      await page.getByRole('button', { name: 'Check wallet again' }).click();
      await page.getByRole('button', { name: 'Mint NFT', exact: true }).waitFor();
      const calls = await page.evaluate(() => window.__nftFixture.calls);
      assert.equal(
        calls.some((c) =>
          ['plabs_requestPrivacyAccess', 'plabs_mintNft', 'plabs_resumeNftMint'].includes(c.method),
        ),
        false,
      );
    },
  );
  await run('wallet-upgrade-is-detected-on-browser-focus', 'upgrade', async (page) => {
    await page.getByRole('button', { name: 'Check wallet again' }).waitFor();
    await page.evaluate(() => {
      window.__nftFixture.enableMinting();
      window.dispatchEvent(new Event('focus'));
    });
    await page.getByRole('button', { name: 'Mint NFT', exact: true }).waitFor();
    assert.equal(
      (await page.evaluate(() => window.__nftFixture.calls)).filter(
        (c) => c.method === 'eth_requestAccounts',
      ).length,
      0,
    );
  });
  await run(
    'transient-status-failure-retries-only-the-public-read',
    'normal',
    async (page, { calls, failNextStatus }) => {
      await page.goto(`${origin}/privasea/collection/${pool}`);
      await page.locator('.nft-item-card').getByText('Minted', { exact: true }).first().waitFor();
      const before = calls.length;
      failNextStatus();
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      await page.waitForFunction(
        () => !document.querySelector('.nft-collection-tabs button[disabled]'),
      );
      const results = calls.slice(before).filter((c) => c.poolStatus);
      assert.deepEqual(
        results.map((c) => c.poolStatus),
        [503, 200],
      );
      assert.equal(await page.locator('.nft-launch-error').count(), 0);
      assert.equal(
        (await page.evaluate(() => window.__nftFixture.calls)).some(
          (c) => c.method === 'plabs_mintNft',
        ),
        false,
      );
    },
  );
  await run(
    'status-failure-explains-the-reason-and-manual-retry-recovers',
    'normal',
    async (page, { failStatus, restoreStatus }) => {
      await page.goto(`${origin}/privasea/collection/${pool}`);
      await page.locator('.nft-item-card').getByText('Minted', { exact: true }).first().waitFor();
      failStatus();
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      await page.getByText(/HTTP 503/).waitFor();
      await page.getByText(/Last snapshot:/).waitFor();
      assert.equal(
        await page.locator('.nft-item-card').getByText('Minted', { exact: true }).count(),
        2,
      );
      restoreStatus();
      await page.getByRole('button', { name: 'Retry status', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.nft-launch-error'));
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
