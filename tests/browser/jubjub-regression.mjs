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
  await page
    .locator('.jubjub-bid-panel')
    .getByRole('button', { name: 'Sign in to auction', exact: true })
    .click();
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
  await approvePaymentReview(page, { total, delta, resume });
}
async function approvePaymentReview(page, { total, delta, resume = false }) {
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
function analyticsStat(page, label) {
  return page
    .locator('.jubjub-analytics .jubjub-analysis-stat')
    .filter({ has: page.getByText(label, { exact: true }) });
}
async function assertAnalyticsStat(page, label, expected) {
  const value = analyticsStat(page, label).locator('strong');
  await value.filter({ hasText: expected }).waitFor();
  assert.equal((await value.innerText()).trim(), expected, label);
}
async function assertWindow(page, { bidders, committed, updates }) {
  await assertAnalyticsStat(page, 'Funded bidder change', bidders);
  await assertAnalyticsStat(page, 'Committed P20 change', committed);
  await assertAnalyticsStat(page, 'Public updates', updates);
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
      assert.equal(
        await page.evaluate(
          () =>
            window.__jubjubFixture.rpcCalls.filter(
              (call) => call.method === 'plabs_sendSponsoredPrivacyTransaction',
            ).length,
        ),
        1,
      );
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
        window.__jubjubFixture.rpcCalls.filter(
          (call) => call.method === 'plabs_sendSponsoredPrivacyTransaction',
        ),
      );
      // The page reload resets its provider call log; these are resume and top-up.
      assert.equal(fundingCalls.length, 2);
      assert.deepEqual(
        fundingCalls.map((call) => call.params[0].payment.amountRaw),
        ['100000000', '50000000'],
      );
      assert.ok(fundingCalls.every((call) => call.params[0].protocol === 'plabs-custody-v1'));
      assert.equal(
        await page.evaluate(() =>
          window.__jubjubFixture.rpcCalls.some((call) => call.method === 'plabs_fundJubjubBid'),
        ),
        false,
      );
      await capture(page, 'confirmed-desktop.png');
    },
  );

  for (const scenario of ['generic-only', 'legacy']) {
    await runCase(
      `payment uses the ${scenario} wallet capability`,
      scenario,
      async (page, state) => {
        await signIn(page);
        await page.getByLabel('Total bid amount', { exact: true }).fill('100');
        await reviewPayment(page, { total: '100', delta: '100' });
        await page.getByRole('button', { name: 'Review saved bid', exact: true }).waitFor();
        assert.equal(state().funding.length, 1);
        const methods = await page.evaluate(() =>
          window.__jubjubFixture.rpcCalls.map((call) => call.method),
        );
        assert.equal(
          methods.includes('plabs_sendSponsoredPrivacyTransaction'),
          scenario === 'generic-only',
        );
        assert.equal(methods.includes('plabs_fundJubjubBid'), scenario === 'legacy');
      },
    );
  }
  await runCase(
    'a rejected generic payment never falls back to a second legacy payment',
    'generic-reject',
    async (page, state) => {
      await signIn(page);
      await page.getByLabel('Total bid amount', { exact: true }).fill('100');
      await reviewPayment(page, { total: '100', delta: '100' });
      await page
        .getByRole('alert')
        .filter({ hasText: 'Request declined in your wallet' })
        .waitFor();
      assert.equal(state().funding.length, 0);
      assert.equal(
        await page.evaluate(() =>
          window.__jubjubFixture.rpcCalls.some((call) => call.method === 'plabs_fundJubjubBid'),
        ),
        false,
      );
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

  await runCase(
    'analysis windows compare public snapshots and refresh live participation',
    'analytics',
    async (page, state) => {
      await page.getByRole('heading', { name: 'Auction activity', exact: true }).waitFor();
      assert.equal(
        await page.getByRole('heading', { name: 'How the auction works', exact: true }).count(),
        0,
      );
      await assertAnalyticsStat(page, 'Funded bidders', '8');
      await assertAnalyticsStat(page, 'Confirmed bids', '10');
      await assertAnalyticsStat(page, 'Average per bidder', '1,612.5 P20');
      const range = page.getByRole('group', { name: 'Auction analysis period' });
      assert.equal(
        await range.getByRole('button', { name: '1h', exact: true }).getAttribute('aria-pressed'),
        'true',
      );
      await assertWindow(page, { bidders: '+4', committed: '+12,300', updates: '4' });

      await range.getByRole('button', { name: '15m', exact: true }).click();
      await assertWindow(page, { bidders: '+2', committed: '+1,100', updates: '2' });
      const activity = page.getByRole('table', { name: 'Recent public auction activity' });
      assert.equal(await activity.locator('tbody tr').count(), 2);
      const recent = await activity.locator('tbody tr').allTextContents();
      assert.match(recent[0], /New participation/);
      assert.match(recent[0], /\+800/);
      assert.match(recent[1], /Added funds/);
      assert.match(recent[1], /\+300/);

      await range.getByRole('button', { name: 'All', exact: true }).click();
      await assertWindow(page, { bidders: '+8', committed: '+12,900', updates: '6' });
      assert.equal(await activity.locator('tbody tr').count(), 6);
      assert.equal(state().publicHistory.at(-1).committedUnits, '12900000000');

      const publicReadsBefore = requests(state(), '/api/jubjub/summary').length;
      await page.evaluate(() => window.__jubjubFixture.publishUpdate());
      // No refresh click: the production five-second totals polling must see the change.
      await assertAnalyticsStat(page, 'Funded bidders', '9');
      await assertAnalyticsStat(page, 'Confirmed bids', '11');
      await assertAnalyticsStat(page, 'Average per bidder', '1,483.33 P20');
      assert.ok(requests(state(), '/api/jubjub/summary').length > publicReadsBefore);
      assert.equal(state().publicHistory.at(-1).committedUnits, '13350000000');
      await page.getByRole('button', { name: 'Refresh auction', exact: true }).click();
      await assertWindow(page, { bidders: '+9', committed: '+13,350', updates: '7' });
      const newest = activity.locator('tbody tr').first();
      assert.match(await newest.innerText(), /\+450/);
      assert.match(await newest.innerText(), /New participation/);
      assert.equal(state().funding.length, 0, 'Analytics never invokes a wallet payment');
      assert.equal(requests(state(), '/api/jubjub/auth/challenge').length, 0);
      await capture(page, 'analytics-live-desktop.png');
    },
  );

  await runCase(
    'hiding the highest series rescales the bid chart and retains at least one line',
    'analytics',
    async (page) => {
      const chart = page.locator('.jubjub-chart');
      const highest = chart.getByRole('button', { name: /^Highest/ });
      await highest.waitFor();
      const title = chart.locator('svg > title');
      const before = await title.textContent();
      const max = (text) => Number(text.match(/ to ([\d,.]+) P20\./)[1].replaceAll(',', ''));
      assert.ok(max(before) > 11000);
      const initialPaths = await chart.locator('svg > path').count();
      await highest.click();
      assert.equal(await highest.getAttribute('aria-pressed'), 'false');
      assert.ok(
        max(await title.textContent()) < 120,
        'Hidden outlier no longer controls the scale',
      );
      assert.equal(await chart.locator('svg > path').count(), initialPaths - 1);
      assert.ok(!(await title.textContent()).includes('Highest'));
      await chart.getByRole('button', { name: /^Average/ }).click();
      const qualifying = chart.getByRole('button', { name: /^Qualifying/ });
      assert.equal(await qualifying.getAttribute('aria-pressed'), 'true');
      assert.equal(await qualifying.isDisabled(), true, 'The last visible line cannot be removed');
      await highest.click();
      assert.equal(await highest.getAttribute('aria-pressed'), 'true');
      assert.ok(max(await title.textContent()) > 11000);
      assert.equal(await qualifying.isDisabled(), false);
    },
  );

  await runCase(
    'my orders distinguish accepted pending failed and resume only the original intent',
    'analytics',
    async (page, state) => {
      const orders = page.getByRole('region', { name: 'My bid orders', exact: true });
      await orders
        .getByText('Sign in with your privacy wallet to view your bids and payment status.', {
          exact: true,
        })
        .waitFor();
      assert.equal(await orders.locator('[data-intent-id]').count(), 0);
      await signIn(page);
      await orders.getByText('Showing 3 of 3 bids', { exact: true }).waitFor();
      const [confirmed, failed, pending] = state().intents;
      const confirmedRow = orders.locator(`[data-intent-id="${confirmed.id}"]`);
      const failedRow = orders.locator(`[data-intent-id="${failed.id}"]`);
      const pendingRow = orders.locator(`[data-intent-id="${pending.id}"]`);
      await confirmedRow.getByText('Confirmed', { exact: true }).waitFor();
      await failedRow.getByText('Failed', { exact: true }).waitFor();
      await pendingRow.getByText('Pending', { exact: true }).waitFor();
      const bidPane = page.locator('.jubjub-bid-panel');
      assert.equal(
        await bidPane.getByLabel('Saved total bid', { exact: true }).inputValue(),
        '200',
      );
      assert.equal(
        await bidPane
          .locator('dl > div')
          .filter({ hasText: 'Additional payment' })
          .locator('dd')
          .innerText(),
        '100 P20',
        'The main payment pane must skip the preceding rejected intent',
      );
      assert.equal(await pendingRow.getByText('Confirmed', { exact: true }).count(), 0);
      assert.equal(await failedRow.getByRole('button', { name: /^Resume bid/ }).count(), 0);
      assert.equal(await confirmedRow.getByRole('button', { name: /^Resume bid/ }).count(), 0);
      assert.match(await failedRow.innerText(), /Synthetic sponsor rejected/);
      assert.equal(
        await pendingRow
          .locator('dl > div')
          .filter({ hasText: 'Total bid' })
          .locator('dd')
          .innerText(),
        '200 P20',
      );
      assert.equal(
        await pendingRow
          .locator('dl > div')
          .filter({ hasText: 'Additional payment' })
          .locator('dd')
          .innerText(),
        '+100 P20',
      );
      assert.equal(
        await confirmedRow.getByRole('link', { name: /View transaction .* on Monadscan/ }).count(),
        1,
      );
      await pendingRow.getByRole('button', { name: /^Resume bid/ }).click();
      await approvePaymentReview(page, { total: '200', delta: '100', resume: true });
      await page.getByText('Bid confirmed: 200 P20 total.', { exact: true }).waitFor();
      await pendingRow.getByText('Confirmed', { exact: true }).waitFor();
      assert.equal(await pendingRow.getByRole('button', { name: /^Resume bid/ }).count(), 0);
      assert.deepEqual(state().funding, [
        { intentId: pending.id, total: '200000000', delta: '100000000' },
      ]);
      assert.equal(
        requests(state(), '/api/jubjub/bids/prepare').length,
        0,
        'Resuming the order must reuse its existing intent',
      );
      await failedRow.getByText('Failed', { exact: true }).waitFor();
      await bidPane.getByText(/An earlier payment needs attention/).waitFor();
      await bidPane.getByLabel('Total bid amount', { exact: true }).fill('250');
      assert.equal(
        await bidPane.getByRole('button', { name: 'Review bid', exact: true }).isDisabled(),
        true,
        'An unresolved rejected prepared intent must prevent another payment',
      );
      assert.equal(
        await bidPane
          .getByRole('link', { name: 'My bid orders', exact: true })
          .getAttribute('href'),
        '#my-bid-orders',
      );
      assert.equal(requests(state(), '/api/jubjub/bids/prepare').length, 0);
      await capture(page, 'my-bid-orders-desktop.png');
      await page.evaluate(() => window.__jubjubFixture.changeAccount());
      await orders
        .getByText('Sign in with your privacy wallet to view your bids and payment status.', {
          exact: true,
        })
        .waitFor();
      assert.equal(
        await orders.locator('[data-intent-id]').count(),
        0,
        'Private order rows are removed when the account changes',
      );
      assert.equal(await page.getByText('YOUR POSITION', { exact: true }).count(), 0);
      assert.equal(state().funding.length, 1);
    },
  );

  await runCase(
    'analytics and my orders fit mobile with a populated private order history',
    'analytics',
    async (page) => {
      await signIn(page);
      await page
        .getByRole('region', { name: 'My bid orders' })
        .getByText('Showing 3 of 3 bids', { exact: true })
        .waitFor();
      await assertAnalyticsStat(page, 'Funded bidders', '8');
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true,
        'Analytics tables and populated orders must not cause horizontal mobile overflow',
      );
      await capture(page, 'analytics-orders-mobile.png');
    },
    { width: 390, height: 844 },
  );

  console.log(`${passes} browser regressions passed. Screenshots: ${artifactDir}`);
} finally {
  await browser.close();
  await fixture.close();
}
