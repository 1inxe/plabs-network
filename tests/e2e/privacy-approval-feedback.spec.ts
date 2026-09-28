import { expect, test } from '@playwright/test';
import { connect, mockApis, mockWallet, revokeReadAccess } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockApis(page);
  await mockWallet(page, true);
  await page.goto('/pex');
  await connect(page);
  await revokeReadAccess(page);
  await page.locator('.wallet-button').click();
});
test('an outdated extension uses a quiet wallet hint instead of a notification', async ({
  page,
}) => {
  await page.evaluate(() => {
    const provider = Reflect.get(window, 'plabsPrivacyWallet'),
      original = provider.request.bind(provider);
    provider.request = async (args: { method: string }) => {
      const response = await original(args);
      if (args.method === 'plabs_getCapabilities')
        return { ...response, methods: { ...response.methods, privacyRead: false } };
      return response;
    };
  });
  const disclosure = page.getByRole('dialog').locator('.wallet-disclosure');
  await disclosure.getByRole('button', { name: 'Authorize balances & history' }).click();
  const feedback = page.getByRole('dialog').locator('.wallet-control-feedback');
  await expect(feedback).toContainText('Wallet access needs attention');
  await feedback.locator('summary').click();
  await expect(feedback).toContainText('Update PLabs Wallet');
  await expect(
    feedback.getByRole('button', { name: 'Open PLabs Wallet', exact: true }),
  ).toBeEnabled();
  await expect(page.locator('.notification-card')).toHaveCount(0);
});
test('approval can be reopened while waiting, rejection remains visible, and retry loads balances', async ({
  page,
}) => {
  await page.evaluate(() => {
    const provider = Reflect.get(window, 'plabsPrivacyWallet'),
      original = provider.request.bind(provider);
    let reject: (error: Error) => void = () => {};
    Reflect.set(window, '__rejectRead', () =>
      reject(Object.assign(new Error('Denied'), { code: 4001 })),
    );
    Reflect.set(window, '__resumeRead', () => {
      provider.request = original;
    });
    provider.request = (args: { method: string }) =>
      args.method === 'plabs_requestPrivacyAccess'
        ? new Promise((_resolve, no) => {
            reject = no;
          })
        : original(args);
  });
  const disclosure = page.getByRole('dialog').locator('.wallet-disclosure');
  await disclosure.getByRole('button', { name: 'Authorize balances & history' }).click();
  await expect(page.getByRole('dialog').locator('.wallet-control-feedback')).toContainText(
    'Approve access in PLabs Wallet',
  );
  await page
    .locator('.wallet-control-feedback')
    .getByRole('button', { name: 'Open PLabs Wallet', exact: true })
    .click();
  expect(
    await page.evaluate(() =>
      Reflect.get(window, '__walletCalls').some(
        (call: { method: string }) => call.method === 'plabs_openWallet',
      ),
    ),
  ).toBe(true);
  await page.evaluate(() => Reflect.get(window, '__rejectRead')());
  const feedback = page.getByRole('dialog').locator('.wallet-control-feedback');
  await feedback.locator('summary').click();
  await expect(feedback).toContainText('declined');
  await expect(page.locator('.notification-card')).toHaveCount(0);
  await page.evaluate(() => Reflect.get(window, '__resumeRead')());
  await disclosure.getByRole('button', { name: 'Authorize balances & history' }).click();
  await expect(
    page.getByRole('dialog').getByRole('region', { name: 'Private assets' }),
  ).toContainText('125.5');
});
