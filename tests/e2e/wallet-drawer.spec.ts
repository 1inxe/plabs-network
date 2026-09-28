import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { connect, mockApis, mockWallet, waitForNotifications } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockApis(page);
  await mockWallet(page, true);
  await page.goto('/pex');
  await connect(page);
  await page.locator('.wallet-button').click();
});

test('compact wallet drawer keeps both balances visible and shows activity in its own view', async ({
  page,
}) => {
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('region', { name: 'Connected wallet addresses' })).toContainText(
    'perc1',
  );
  await expect(drawer.getByRole('link', { name: 'View public transactions' })).toHaveAttribute(
    'href',
    `https://monadscan.com/address/0x${'1'.repeat(40)}`,
  );
  const publicAssets = drawer.getByRole('region', { name: 'Public assets' }),
    privateAssets = drawer.getByRole('region', { name: 'Private assets' });
  await expect(publicAssets.locator('.wallet-asset')).toHaveCount(2);
  await expect(publicAssets).toContainText('12.25');
  await expect(publicAssets).toContainText('MON');
  await expect(privateAssets.locator('.wallet-asset')).toHaveCount(2);
  await expect(privateAssets).toContainText('P20');
  await expect(privateAssets).toContainText('Available 100');
  await expect(privateAssets).toContainText('Pending 25.5');
  await expect(drawer.getByRole('list', { name: 'Wallet transactions' })).toHaveCount(0);
  await drawer.getByRole('radio', { name: 'Activity', exact: true }).click();
  await expect(drawer.getByRole('list', { name: 'Wallet transactions' })).toContainText(
    '5.5 sUSDC',
  );
  await expect(drawer.getByRole('list', { name: 'Wallet transactions' })).toContainText(
    'Received note',
  );
  const download = page.waitForEvent('download');
  await drawer.getByRole('button', { name: 'Export page' }).click();
  expect((await download).suggestedFilename()).toBe('plabs-wallet-history-page.csv');
});

test('drawer remains at the right edge with independent scrolling and restores keyboard focus', async ({
  page,
  isMobile,
}) => {
  const drawer = page.getByRole('dialog');
  await expect
    .poll(async () => {
      const rect = await drawer.boundingBox();
      return rect ? Math.round(rect.x + rect.width) : 0;
    })
    .toBe(page.viewportSize()?.width);
  const rect = await drawer.boundingBox();
  expect(rect?.y).toBe(0);
  expect(rect?.height).toBe(page.viewportSize()?.height);
  if (!isMobile) {
    expect(rect?.x).toBeGreaterThan(0);
    expect(rect?.width).toBe(420);
  }
  await expect(drawer).toContainText('125.5');
  // The normal four-asset view fits without scrolling; only a long asset list scrolls.
  if (!isMobile)
    expect(
      await drawer
        .locator('.drawer-body')
        .evaluate((element) => element.scrollHeight <= element.clientHeight),
    ).toBe(true);
  await page.evaluate(() => {
    const provider = Reflect.get(window, 'plabsPrivacyWallet'),
      original = provider.request.bind(provider);
    provider.request = async (args: { method: string }) => {
      const result = await original(args);
      if (args.method === 'plabs_getBalances')
        result.public.assets = Array.from({ length: 20 }, (_, i) => ({
          ...result.public.assets[0],
          address: `0x${i.toString(16).padStart(40, '0')}`,
          symbol: `ASSET${i}`,
        }));
      return result;
    };
  });
  await drawer.getByRole('button', { name: 'Refresh balances' }).click();
  await expect(
    drawer.getByRole('region', { name: 'Public assets' }).locator('.wallet-asset'),
  ).toHaveCount(20);
  const header = await drawer.locator('.drawer-header').boundingBox(),
    footer = await drawer.locator('.drawer-footer').boundingBox();
  const pageScroll = await page.evaluate(() => document.documentElement.scrollTop);
  await drawer
    .locator('.drawer-body')
    .evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect
    .poll(() => drawer.locator('.drawer-body').evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  expect((await drawer.locator('.drawer-header').boundingBox())?.y).toBe(header?.y);
  expect((await drawer.locator('.drawer-footer').boundingBox())?.y).toBe(footer?.y);
  expect(await page.evaluate(() => document.documentElement.scrollTop)).toBe(pageScroll);
  expect(await drawer.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await drawer.getByRole('button', { name: 'Close wallet' }).click();
  await expect(drawer).toBeHidden();
  await expect(page.locator('.wallet-button')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(page.locator('.wallet-button')).toBeFocused();
});

test('authorized wallet drawer has no automated accessibility violations', async ({ page }) => {
  const drawer = page.getByRole('dialog');
  await expect(drawer).toContainText('125.5');
  await waitForNotifications(page);
  const results = await new AxeBuilder({ page })
    .include('.drawer-content')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
