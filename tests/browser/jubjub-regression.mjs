import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createJubjubFixtureServer } from './jubjub-fixture.mjs';

const require = createRequire(import.meta.url);
const candidates = [
  process.env.JUBJUB_PLAYWRIGHT_PATH,
  join(homedir(), 'Workspace/ai/rea/node_modules/playwright-core/index.mjs'),
];
try {
  candidates.unshift(require.resolve('playwright-core'));
} catch {
  /* Use an existing tool installation. */
}
const playwrightPath = candidates.find((path) => path && existsSync(path));
if (!playwrightPath)
  throw new Error(
    'Set JUBJUB_PLAYWRIGHT_PATH to an existing playwright-core entry file. No dependency is installed by this regression.',
  );
const { chromium } = await import(pathToFileURL(resolve(playwrightPath)).href);
const executablePath = [
  process.env.JUBJUB_BROWSER_PATH,
  chromium.executablePath(),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((path) => path && existsSync(path));
if (!executablePath)
  throw new Error('Set JUBJUB_BROWSER_PATH to an installed Chrome or Chromium executable.');
const artifactDir = resolve(
  process.env.JUBJUB_ARTIFACT_DIR ?? join(tmpdir(), 'plabs-jubjub-browser'),
);
await mkdir(artifactDir, { recursive: true });
const fixture = await createJubjubFixtureServer({ port: 0 });
const browser = await chromium.launch({ headless: true, executablePath }).catch(async (error) => {
  await fixture.close();
  throw error;
});
let passes = 0;

async function runCase(name, scenario, run, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const pageErrors = [],
    externalRequests = [];
  const id = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  page.setDefaultTimeout(12000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin === fixture.url) await route.continue();
    else {
      externalRequests.push(route.request().url());
      await route.abort();
    }
  });
  try {
    await page.goto(`${fixture.url}/privasea/jubjub?scenario=${scenario}&fixtureId=${id}`);
    await page.getByRole('heading', { name: 'A private bid. A place in JubJub.' }).waitFor();
    await run(page, () => fixture.state(id));
    assert.deepEqual(pageErrors, [], 'No browser runtime exceptions');
    assert.deepEqual(externalRequests, [], 'The regression must never access production');
    passes++;
    console.log(`PASS ${name}`);
  } catch (error) {
    await page.screenshot({ path: join(artifactDir, `${id}-failed.png`), fullPage: true });
    console.error(`FAIL ${name}\n${await page.locator('body').innerText()}`);
    throw error;
  } finally {
    await context.close();
  }
}

async function signIn(page) {
  await page.getByRole('button', { name: 'Sign in to auction', exact: true }).click();
  await page
    .getByText('Signed in. Your current bid and settlement status are available below.', {
      exact: true,
    })
    .waitFor();
  await page.getByText('YOUR POSITION', { exact: true }).waitFor();
}
function requests(state, path) {
  return state.requests.filter((request) => request.path === path);
}
async function capture(page, filename) {
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.screenshot({ path: join(artifactDir, filename), fullPage: true });
}
async function reviewPayment(page, { total, delta, resume = false }) {
  await page
    .getByRole('button', { name: resume ? 'Review saved bid' : 'Review bid', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  const rows = dialog.locator('dl > div');
  assert.equal(
    (await rows.filter({ hasText: 'Total bid' }).locator('dd').innerText()).trim(),
    `${total} P20`,
  );
  assert.equal(
    (await rows.filter({ hasText: 'Additional payment' }).locator('dd').innerText()).trim(),
    `${delta} P20`,
  );
  await dialog
    .getByRole('button', { name: resume ? 'Resume in wallet' : 'Continue to wallet', exact: true })
    .click();
}

try {
  await runCase(
    'initial bid resumes after reload and raising pays only the difference',
    'flow',
    async (page, state) => {
      await signIn(page);
      const amount = page.getByLabel('Total bid amount', { exact: true });
      await amount.fill('125');
      await page
        .getByText('The total bid must be a multiple of 50 P20.', { exact: true })
        .waitFor();
      assert.equal(
        await page.getByRole('button', { name: 'Review bid', exact: true }).isDisabled(),
        true,
      );
      assert.equal(requests(state(), '/api/jubjub/bids/prepare').length, 0);
      await amount.fill('100');
      await reviewPayment(page, { total: '100', delta: '100' });
      await page.getByRole('button', { name: 'Review saved bid', exact: true }).waitFor();
      assert.equal(await page.getByLabel('Saved total bid', { exact: true }).inputValue(), '100');
      assert.equal(state().funding.length, 1);
      assert.equal(state().confirmedTotal, 0n);
      await page.reload();
      await signIn(page);
      await reviewPayment(page, { total: '100', delta: '100', resume: true });
      await page.getByText('Bid confirmed: 100 P20 total.', { exact: true }).waitFor();
      assert.equal(state().funding.length, 2);
      assert.equal(state().funding[0].intentId, state().funding[1].intentId);
      assert.equal(requests(state(), '/api/jubjub/bids/prepare').length, 1);
      await page.getByLabel('Total bid amount', { exact: true }).fill('150');
      await reviewPayment(page, { total: '150', delta: '50' });
      await page.getByText('Bid confirmed: 150 P20 total.', { exact: true }).waitFor();
      assert.equal(state().funding.at(-1).delta, '50000000');
      assert.equal(state().confirmedTotal, 150000000n);
      assert.equal(state().intents.length, 2);
      assert.deepEqual(
        requests(state(), '/api/jubjub/bids/prepare').map((request) => request.body.version),
        [0, 1],
      );
      assert.equal(
        await page.evaluate(() =>
          [...Object.values(localStorage), ...Object.values(sessionStorage)].some((value) =>
            value.includes('synthetic-'),
          ),
        ),
        false,
      );
      const fundingCalls = await page.evaluate(() =>
        window.__jubjubFixture.rpcCalls.filter((call) => call.method === 'plabs_fundJubjubBid'),
      );
      assert.ok(
        fundingCalls.every(
          (call) => Object.keys(call.params[0]).sort().join(',') === 'intentId,token',
        ),
      );
      await capture(page, 'confirmed-desktop.png');
    },
  );

  await runCase('ended auction reports queued custody refund', 'refund', async (page, state) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Check settlement & refund', exact: true }).click();
    await page
      .getByText('150 P20 queued for return to your privacy wallet. Gas is sponsored.', {
        exact: true,
      })
      .waitFor();
    assert.equal(state().refundsRequested, 1);
    assert.equal(state().funding.length, 0);
    assert.equal(await page.getByLabel('Total bid amount', { exact: true }).isDisabled(), true);
    await capture(page, 'refund-desktop.png');
  });

  await runCase(
    'rejected signature never authenticates or prepares a payment',
    'reject',
    async (page, state) => {
      await page.getByRole('button', { name: 'Sign in to auction', exact: true }).click();
      await page
        .getByRole('alert')
        .filter({ hasText: 'Request declined in your wallet' })
        .waitFor();
      assert.equal(requests(state(), '/api/jubjub/auth/session').length, 0);
      assert.equal(requests(state(), '/api/jubjub/bids/prepare').length, 0);
      assert.equal(
        await page.evaluate(() =>
          window.__jubjubFixture.rpcCalls.some(
            (call) => call.method === 'plabs_provePrivacyOwnership',
          ),
        ),
        false,
      );
    },
  );

  await runCase(
    'wrong network requires explicit switch before sign-in',
    'network',
    async (page, state) => {
      await page.getByRole('button', { name: 'Switch to Monad', exact: true }).waitFor();
      assert.equal(requests(state(), '/api/jubjub/auth/challenge').length, 0);
      assert.equal(
        await page.getByRole('button', { name: 'Sign in to auction', exact: true }).count(),
        0,
      );
      await page.getByRole('button', { name: 'Switch to Monad', exact: true }).click();
      await signIn(page);
      assert.equal(
        await page.evaluate(() =>
          window.__jubjubFixture.rpcCalls.some(
            (call) =>
              call.method === 'wallet_switchEthereumChain' && call.params[0].chainId === '0x8f',
          ),
        ),
        true,
      );
    },
  );

  await runCase(
    'account change during approval discards the stale sign-in',
    'stale',
    async (page, state) => {
      await page.getByRole('button', { name: 'Sign in to auction', exact: true }).click();
      await page.waitForFunction(() => window.__jubjubFixture.waitingForSignature);
      await page.evaluate(() => window.__jubjubFixture.changeAccount());
      await page.getByRole('button', { name: 'Sign in to auction', exact: true }).waitFor();
      await page.evaluate(() => window.__jubjubFixture.releaseSignature());
      await page.getByRole('button', { name: 'Sign in to auction', exact: true }).waitFor();
      assert.equal(requests(state(), '/api/jubjub/auth/session').length, 0);
      assert.equal(requests(state(), '/api/jubjub/bids/prepare').length, 0);
      assert.equal(await page.getByText('YOUR POSITION', { exact: true }).count(), 0);
    },
  );

  await runCase(
    'older extension permits reading but blocks bid funding',
    'old',
    async (page, state) => {
      await signIn(page);
      await page
        .getByText('Update and reload PLabs Wallet to enable JubJub bidding.', { exact: false })
        .waitFor();
      await page.getByLabel('Total bid amount', { exact: true }).fill('100');
      assert.equal(await page.getByRole('button', { name: 'Review bid', exact: true }).count(), 0);
      assert.equal(requests(state(), '/api/jubjub/bids/prepare').length, 0);
      assert.equal(state().funding.length, 0);
    },
  );

  await runCase(
    'locked wallet unlocks before campaign sign-in on mobile',
    'locked',
    async (page, state) => {
      await page.getByRole('button', { name: 'Unlock privacy wallet', exact: true }).click();
      await signIn(page);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true,
        'No horizontal mobile overflow',
      );
      assert.equal(requests(state(), '/api/jubjub/auth/session').length, 1);
      await capture(page, 'signed-in-mobile.png');
    },
    { width: 390, height: 844 },
  );

  console.log(`${passes} browser regressions passed. Screenshots: ${artifactDir}`);
} finally {
  await browser.close();
  await fixture.close();
}
