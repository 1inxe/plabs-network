import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const runtimes = [
  process.env.JUBJUB_PLAYWRIGHT_PATH,
  join(homedir(), 'Workspace/ai/rea/node_modules/playwright-core/index.mjs'),
];
try {
  runtimes.unshift(require.resolve('playwright-core'));
} catch {
  /* Use the installed browser runtime. */
}
const runtime = runtimes.find((path) => path && existsSync(path));
if (!runtime) throw new Error('Set JUBJUB_PLAYWRIGHT_PATH to an installed playwright-core.');
const { chromium } = await import(pathToFileURL(resolve(runtime)).href);
const executablePath = [
  process.env.JUBJUB_BROWSER_PATH,
  chromium.executablePath(),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/chromium',
].find((path) => path && existsSync(path));
const origin = process.env.SDK_RUNTIME_ORIGIN ?? 'http://127.0.0.1:5180';
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const context = await browser.newContext();
  // A blank same-origin document loads the actual adapter served by the running
  // development process, including its existing dependency resolver/cache.
  await context.route(`${origin}/__sdk-runtime-probe`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>SDK runtime probe</title>',
    }),
  );
  const page = await context.newPage(),
    modules = [];
  page.on('response', (response) => {
    if (response.url().includes('plabs-js-sdk')) modules.push(response.url());
  });
  await page.goto(`${origin}/__sdk-runtime-probe`);
  const result = await page.evaluate(async () => {
    const { createPlabsAdapter } = await import('/src/services/wallet/plabs-adapter.ts');
    const calls = [];
    const adapter = createPlabsAdapter({
      on() {},
      removeListener() {},
      async request(input) {
        calls.push(input);
        return { synthetic: true };
      },
    });
    const pool = `0x${'12'.repeat(20)}`,
      id = '12345678-1234-4234-8234-123456789012';
    await adapter.provePrivacyOwnership('Synthetic SDK runtime challenge', `0x${'34'.repeat(43)}`);
    await adapter.mintNft({ chainId: 1, poolAddress: pool });
    await adapter.nftMints();
    await adapter.resumeNftMint(id);
    await adapter.nftAssets();
    return calls.map((call) => call.method);
  });
  assert.deepEqual(result, [
    'plabs_provePrivacyOwnership',
    'plabs_mintNft',
    'plabs_getNftMints',
    'plabs_resumeNftMint',
    'plabs_getNftAssets',
  ]);
  assert.ok(modules.length > 0);
  assert.equal(
    modules.some((url) => url.includes('/.vite/deps/plabs-js-sdk')),
    false,
    'A running dev server must not retain an older optimized wallet SDK',
  );
  console.log(
    'PASS actual running-server SDK exposes ownership, mint, recovery and NFT holding APIs; synthetic provider only.',
  );
} finally {
  await browser.close();
}
