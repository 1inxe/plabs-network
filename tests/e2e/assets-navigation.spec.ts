import { expect, test } from '@playwright/test';
import { connect, mockApis, mockWallet } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockApis(page);
  await mockWallet(page, true);
});

test('legacy asset links resolve to one workspace and select the appropriate action', async ({
  page,
  isMobile,
}) => {
  for (const [from, target, tab] of [
    ['/pefi', '/assets', 'Deposit'],
    ['/shield', '/assets?mode=deposit', 'Deposit'],
    ['/pay', '/assets?mode=transfer', 'Private transfer'],
    ['/privacypay', '/assets?mode=transfer', 'Private transfer'],
  ]) {
    await page.goto(from ?? '/');
    await expect(page).toHaveURL(new RegExp(`${target?.replace('?', '\\?')}$`));
    await expect(page.getByRole('heading', { name: 'Assets', exact: true })).toBeVisible();
    await expect(page.getByRole('radio', { name: tab, exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  }
  if (isMobile) await page.getByRole('button', { name: 'Open navigation' }).click();
  const nav = isMobile
    ? page.getByRole('dialog', { name: 'Navigation' })
    : page.locator('.sidebar');
  await expect(nav.getByRole('link', { name: 'Assets', exact: true })).toHaveCount(1);
  await expect(nav.getByRole('link', { name: /PeFi|Pay|Shield Gateway/ })).toHaveCount(0);
  if (isMobile) await page.getByRole('button', { name: 'Close menu' }).click();
  await page.getByRole('radio', { name: 'Withdraw', exact: true }).click();
  await expect(page).toHaveURL(/\/assets\?mode=withdraw$/);
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'Recipient privacy address' })).toBeVisible();
});

test('unsupported products are visibly disabled without requesting connection or approval', async ({
  page,
  isMobile,
}) => {
  await page.goto('/p-sea');
  await expect(page.getByRole('radio', { name: 'My NFTs', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: /Join allowlist|Registration closed/ }),
  ).toBeDisabled();
  await expect(page.getByText('Browsing only.', { exact: false })).toBeVisible();
  await page.goto('/p-fun');
  await expect(page.getByRole('button', { name: 'Create token', exact: true })).toBeDisabled();
  if (isMobile) await page.getByRole('button', { name: 'Open navigation' }).click();
  const nav = isMobile
    ? page.getByRole('dialog', { name: 'Navigation' })
    : page.locator('.sidebar');
  await expect(nav.getByRole('button', { name: /Token launch/ })).toBeDisabled();
  expect(
    await page.evaluate(() =>
      Reflect.get(window, '__walletCalls').filter((call: { method: string }) =>
        [
          'eth_requestAccounts',
          'plabs_requestPrivacyAccess',
          'plabs_sendPrivacyTransaction',
        ].includes(call.method),
      ),
    ),
  ).toEqual([]);
});

test('wallet shortcuts respect network capability and open the correct asset action', async ({
  page,
}) => {
  await page.goto('/assets');
  await page.evaluate(() => {
    const provider = Reflect.get(window, 'plabsPrivacyWallet'),
      request = provider.request.bind(provider);
    provider.request = async (args: { method: string }) => {
      const result = await request(args);
      if (args.method === 'plabs_getCapabilities')
        result.networks = result.networks.map((network: { pools: object[] }) => ({
          ...network,
          pools: network.pools.map((pool) => ({ ...pool, canUnshield: false })),
        }));
      return result;
    };
  });
  await connect(page);
  await page.locator('.wallet-button').click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('button', { name: 'Withdraw', exact: true })).toBeDisabled();
  await drawer.getByRole('button', { name: 'Transfer', exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(page).toHaveURL(/\/assets\?mode=transfer$/);
  await expect(page.getByRole('textbox', { name: 'Recipient privacy address' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Withdraw', exact: true })).toBeDisabled();
  await page.evaluate(() => {
    history.pushState({}, '', '/assets?mode=withdraw');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('button', { name: 'Review withdrawal', exact: true })).toBeDisabled();
  await expect(page.getByText('Withdraw is not supported', { exact: false })).toBeVisible();
});

test('address summaries expand without changing the complete copied address', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/assets');
  await connect(page);
  await page.locator('.wallet-button').click();
  const drawer = page.getByRole('dialog'),
    full = `perc1${'a'.repeat(80)}`;
  await drawer.getByRole('button', { name: 'Full addresses' }).click();
  await expect(drawer.locator('code').filter({ hasText: full })).toBeVisible();
  await drawer.getByRole('button', { name: 'Copy privacy address', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(full);
  await drawer.getByRole('button', { name: 'Shorten', exact: true }).click();
  await expect(drawer.locator('code').filter({ hasText: full })).toHaveCount(0);
  expect(await drawer.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});
