import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { connect, mockApis, mockWallet } from './fixtures';

test.beforeEach(async ({ page }) => mockApis(page));
for (const [route, title] of [
  ['assets', 'Assets'],
  ['shield', 'Assets'],
  ['pex', 'P20 / sUSDC'],
  ['explorer', 'Privacy Pool Explorer'],
  ['history', 'Activity'],
  ['p-sea', 'The Genesis collection.'],
  ['p-fun', 'Token launch'],
  ['pefi', 'Assets'],
]) {
  test(`${route} renders without errors or horizontal overflow`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/${route}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(title ?? '');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    expect(errors).toEqual([]);
  });
}
test('explains missing extensions and allows keyboard dismissal', async ({ page }) => {
  await page.goto('/shield');
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Not detected');
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Connect PLabs Wallet', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});
test('connects by intent, reviews the exact amount, and records wallet status', async ({
  page,
}) => {
  await mockWallet(page);
  await page.goto('/shield');
  await expect
    .poll(() =>
      page.evaluate(() =>
        Reflect.get(window, '__walletCalls').some(
          (x: { method: string }) => x.method === 'eth_accounts',
        ),
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(() =>
      Reflect.get(window, '__walletCalls').some(
        (x: { method: string }) => x.method === 'eth_requestAccounts',
      ),
    ),
  ).toBe(false);
  await connect(page);
  await page.getByRole('textbox', { name: 'Amount', exact: true }).fill('0.123456789123456789');
  await page.getByRole('button', { name: 'Review deposit', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Continue in PLabs Wallet', exact: true }),
  ).toBeVisible();
  await page.getByRole('textbox', { name: 'Amount', exact: true }).fill('2.5');
  await expect(page.getByRole('button', { name: 'Review deposit', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review deposit', exact: true }).click();
  await page.getByRole('button', { name: 'Continue in PLabs Wallet', exact: true }).click();
  await expect(page.locator('.recent-panel')).toContainText('pending');
  await expect(page.locator('.notification-card')).toHaveCount(0);
  const calls = await page.evaluate(() => Reflect.get(window, '__walletCalls'));
  expect(
    calls.filter((c: { method: string }) => c.method === 'plabs_sendPrivacyTransaction'),
  ).toEqual([
    {
      method: 'plabs_sendPrivacyTransaction',
      params: [
        { chainId: '0x8f', poolAddress: `0x${'a'.repeat(40)}`, amount: '2.5', kind: 'shield' },
      ],
    },
  ]);
  await page.locator('.recent-panel').getByRole('link', { name: 'View all' }).click();
  await expect(page.getByRole('cell', { name: 'pending', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Details' }).click();
  await page.getByRole('button', { name: 'Refresh status' }).click();
  await expect(page.getByRole('dialog')).toContainText('confirmed');
  await page.keyboard.press('Escape');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await download).suggestedFilename()).toBe('plabs-session-activity.csv');
});
test('invalid transfer recipients never reach the extension', async ({ page }) => {
  await mockWallet(page);
  await page.goto('/shield');
  await connect(page);
  await page.getByRole('radio', { name: /Private transfer/ }).click();
  await page.getByRole('textbox', { name: 'Amount', exact: true }).fill('10');
  await page
    .getByRole('textbox', { name: 'Recipient privacy address' })
    .fill('0x-public-is-not-private');
  await expect(page.getByRole('button', { name: 'Review private transfer' })).toBeDisabled();
  expect(
    await page.evaluate(() =>
      Reflect.get(window, '__walletCalls').some(
        (x: { method: string }) => x.method === 'plabs_sendPrivacyTransaction',
      ),
    ),
  ).toBe(false);
});
test('renders verified market feed and gates unavailable settlement', async ({ page }) => {
  await mockWallet(page);
  await page.goto('/pex');
  await expect(page.getByRole('heading', { name: 'P20 / sUSDC' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Live P20 price candlestick chart' })).toBeVisible();
  await page.getByRole('button', { name: '1h', exact: true }).click();
  await expect(page.getByRole('button', { name: '1h', exact: true })).toHaveClass('active');
  await expect(page.getByText('Settlement is paused', { exact: false })).toHaveCount(0);
  await expect(
    page.getByText('Update PLabs Wallet to version 0.7.0', {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole('radio', { name: 'FDV', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'FDV', exact: true })).toHaveAttribute(
    'data-state',
    'checked',
  );
});
test('recovers from an unavailable market service', async ({ page }) => {
  await page.route('**/api/market/healthz', (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto('/pex');
  await expect(page.getByText('Market temporarily unavailable')).toBeVisible({ timeout: 15000 });
  await page.unroute('**/api/market/healthz');
  await page.getByRole('button', { name: 'Retry market connection' }).click();
  await expect(page.getByRole('heading', { name: 'P20 / sUSDC' })).toBeVisible();
});
test('search validates identifiers and collection dialog uses local assets', async ({ page }) => {
  await page.goto('/explorer');
  await page.getByRole('textbox', { name: 'Explorer search' }).fill('invalid-address');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(
    page.getByText('Enter a complete 0x transaction hash', { exact: false }),
  ).toBeVisible();
  await page.goto('/p-sea');
  await expect(page.getByText('6,300')).toBeVisible();
  await page.getByRole('button', { name: /Cipher Sovereign/ }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'This preview does not represent a mint or sale',
  );
  await expect(
    page.getByRole('dialog').getByRole('img', { name: 'Cipher Sovereign' }),
  ).toBeVisible();
});
test('core gateway has no automated serious accessibility violations', async ({ page }) => {
  await page.goto('/shield');
  await expect(page.getByRole('heading', { name: 'Assets', exact: true })).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations).toEqual([]);
});

test('account changes close transaction details and clear session history', async ({ page }) => {
  await mockWallet(page);
  await page.goto('/shield');
  await connect(page);
  await page.getByRole('textbox', { name: 'Amount', exact: true }).fill('1');
  await page.getByRole('button', { name: 'Review deposit', exact: true }).click();
  await page.getByRole('button', { name: 'Continue in PLabs Wallet', exact: true }).click();
  await page.locator('.recent-panel').getByRole('link', { name: 'View all' }).click();
  await page.getByRole('button', { name: 'Details' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.evaluate(() => Reflect.get(window, '__switchAccount')());
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'No activity yet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
});

test('market accepts positive signed changes and an empty 24h VWAP', async ({ page }) => {
  await page.route('**/api/market/market/stats', (route) =>
    route.fulfill({
      json: {
        as_of_ms: 1790517414000,
        fully_diluted_supply: '1000000000',
        vwap_24h: null,
        spot_fdv: '1150000',
        matched_base_volume_24h: '0',
        fdv_change_percent: '+9.5238',
      },
    }),
  );
  await page.goto('/pex');
  await expect(page.getByText('9.52%', { exact: true })).toBeVisible();
  await expect(page.getByText('No trades in 24h', { exact: true })).toBeVisible();
  await expect(page.getByText('$1.15M', { exact: true })).toBeAttached();
});
