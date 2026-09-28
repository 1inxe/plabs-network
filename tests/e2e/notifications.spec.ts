import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { connect, mockApis, mockWallet, revokeReadAccess, waitForNotifications } from './fixtures';

async function prepareTransaction(page: import('@playwright/test').Page) {
  await mockApis(page);
  await mockWallet(page, true);
  await page.goto('/assets');
  await connect(page);
  await page.getByRole('textbox', { name: 'Amount', exact: true }).fill('2.5');
  await page.getByRole('button', { name: 'Review deposit', exact: true }).click();
}

test('only transaction failures open a fixed scrollable error notification', async ({ page }) => {
  await prepareTransaction(page);
  await page.evaluate(() => {
    const provider = Reflect.get(window, 'plabsPrivacyWallet'),
      original = provider.request.bind(provider);
    const details = Array.from(
      { length: 60 },
      (_, i) =>
        `Detail ${i + 1}: The transaction request failed. Read the full details before trying again.`,
    ).join('\n');
    provider.request = (args: { method: string }) =>
      args.method === 'plabs_sendPrivacyTransaction'
        ? Promise.reject(
            new Error(`${details}\n<script>window.notificationInjected = true</script>`),
          )
        : original(args);
  });
  await page.getByRole('button', { name: 'Continue in PLabs Wallet', exact: true }).click();
  const notice = page.getByRole('alert', { name: 'Transaction request failed' });
  await expect(notice).toBeVisible();
  await page.locator('.wallet-button').click();
  await expect
    .poll(async () => {
      const box = await page.getByRole('dialog').boundingBox();
      return Math.round((box?.x ?? 0) + (box?.width ?? 0));
    })
    .toBe(page.viewportSize()?.width);
  await waitForNotifications(page);
  const drawer = page.getByRole('dialog'),
    rect = await notice.boundingBox();
  expect(rect?.width).toBe(Math.min(384, (page.viewportSize()?.width ?? 0) - 32));
  expect(rect?.height).toBeCloseTo(176, 1);
  expect(rect?.y).toBeCloseTo(88, 1);
  expect(Math.round((rect?.x ?? 0) + (rect?.width ?? 0))).toBe(
    (page.viewportSize()?.width ?? 0) - 16,
  );
  const content = notice.getByRole('region', { name: 'Notification details' });
  expect(await content.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
  const drawerScroll = await drawer.locator('.drawer-body').evaluate((e) => e.scrollTop);
  await content.focus();
  await expect(content).toBeFocused();
  await page.keyboard.press('End');
  await expect.poll(() => content.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  expect(await drawer.locator('.drawer-body').evaluate((e) => e.scrollTop)).toBe(drawerScroll);
  expect(await page.evaluate(() => Reflect.get(window, 'notificationInjected'))).toBeUndefined();
  const violations = await new AxeBuilder({ page })
    .include('.notification-card')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(violations.violations).toEqual([]);
  await notice.getByRole('button', { name: 'Dismiss notification' }).click();
  await expect(notice).toBeHidden();
  await expect(drawer).toBeVisible();
});

test('pending submissions stay quiet and confirmed transactions notify only once', async ({
  page,
}) => {
  await prepareTransaction(page);
  await page.getByRole('button', { name: 'Continue in PLabs Wallet', exact: true }).click();
  await expect(page.locator('.recent-panel')).toContainText('pending');
  await expect(page.locator('.notification-card')).toHaveCount(0);
  await page.locator('.recent-panel').getByRole('link', { name: 'View all' }).click();
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh status' }).click();
  const confirmed = page.getByRole('status', { name: 'Transaction confirmed', exact: true });
  await expect(confirmed).toHaveAttribute('data-kind', 'success');
  await confirmed.getByRole('button', { name: 'Dismiss notification' }).click();
  await expect(confirmed).toBeHidden();
  await page.getByRole('button', { name: 'Refresh status' }).click();
  await expect(page.locator('.notification-card')).toHaveCount(0);
});

test('authorization, copy and wallet read failures never enter the notification channel', async ({
  page,
}) => {
  await mockApis(page);
  await mockWallet(page, true);
  await page.goto('/assets');
  await connect(page);
  await expect(page.locator('.notification-card')).toHaveCount(0);
  await page.locator('.wallet-button').click();
  await page.evaluate(() => {
    const provider = Reflect.get(window, 'plabsPrivacyWallet'),
      original = provider.request.bind(provider);
    provider.request = (args: { method: string }) =>
      args.method === 'plabs_requestPrivacyAccess'
        ? Promise.reject(Object.assign(new Error('Rejected'), { code: 4001 }))
        : original(args);
    Reflect.set(window, '__restoreNotificationRequest', () => {
      provider.request = original;
    });
  });
  const drawer = page.getByRole('dialog');
  await revokeReadAccess(page);
  await drawer.getByRole('button', { name: 'Authorize balances & history' }).click();
  await expect(drawer.locator('.wallet-control-feedback')).toContainText(
    'Wallet access needs attention',
  );
  await expect(page.locator('.notification-card')).toHaveCount(0);
  await page.evaluate(() => Reflect.get(window, '__restoreNotificationRequest')());
  await drawer.getByRole('button', { name: 'Authorize balances & history' }).click();
  await expect(drawer.getByRole('region', { name: 'Private assets' })).toContainText('125.5');
  await drawer.getByRole('button', { name: 'Copy privacy address', exact: true }).click();
  await expect(page.locator('.notification-card')).toHaveCount(0);
  await page.evaluate(() => {
    const provider = Reflect.get(window, 'plabsPrivacyWallet'),
      original = provider.request.bind(provider);
    provider.request = (args: { method: string }) =>
      args.method === 'plabs_getBalances'
        ? Promise.reject(new Error('Balance service unavailable'))
        : original(args);
  });
  await drawer.getByRole('button', { name: 'Refresh balances' }).click();
  await expect(page.locator('.notification-card')).toHaveCount(0);
});

test('market data outages do not show transaction notifications', async ({ page }) => {
  await mockApis(page);
  await mockWallet(page);
  await page.route('**/api/market/healthz', (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto('/pex');
  await expect(page.getByText('Market temporarily unavailable')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.notification-card')).toHaveCount(0);
});

test('cancelling wallet approval is silent rather than reported as a failed transaction', async ({
  page,
}) => {
  await prepareTransaction(page);
  await page.evaluate(() => {
    const provider = Reflect.get(window, 'plabsPrivacyWallet'),
      original = provider.request.bind(provider);
    provider.request = (args: { method: string }) =>
      args.method === 'plabs_sendPrivacyTransaction'
        ? Promise.reject(Object.assign(new Error('Cancelled'), { code: 4001 }))
        : original(args);
  });
  await page.getByRole('button', { name: 'Continue in PLabs Wallet', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Continue in PLabs Wallet', exact: true }),
  ).toBeEnabled();
  await expect(page.locator('.notification-card')).toHaveCount(0);
});
