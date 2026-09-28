import { expect, test } from '@playwright/test';
import { connect, mockApis, mockWallet } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockApis(page);
  await mockWallet(page, true);
});
test('uses the privacy identity in the header and shares balances only with approval', async ({
  page,
}) => {
  await page.goto('/shield');
  await connect(page);
  const accountButton = page.locator('.wallet-button');
  await expect(accountButton).toContainText('perc1');
  await expect(accountButton).not.toContainText('0x111');
  await accountButton.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Public EVM address');
  const calls = await page.evaluate(() => Reflect.get(window, '__walletCalls'));
  expect(calls.filter((call: { method: string }) => call.method === 'plabs_connect')).toHaveLength(
    1,
  );
  expect(
    calls.filter((call: { method: string }) => call.method === 'plabs_requestPrivacyAccess'),
  ).toHaveLength(0);
  await expect(dialog).toContainText('2.5');
  await expect(dialog).toContainText('125.5');
  await expect(dialog).toContainText('Available 100');
  await expect(dialog).toContainText('Pending 25.5');
  await dialog.getByRole('radio', { name: 'Activity', exact: true }).click();
  await expect(dialog.getByRole('list', { name: 'Wallet transactions' })).toContainText(
    '5.5 sUSDC',
  );
  await dialog.getByRole('radio', { name: 'Assets', exact: true }).click();
  await dialog.locator('summary').filter({ hasText: 'Private note details' }).click();
  await expect(dialog.getByText('Spendable', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Wallet connection settings' }).click();
  await page.getByRole('menuitem', { name: 'Revoke data access' }).click();
  await expect(page.locator('.wallet-button')).toContainText('Privacy wallet');
  await expect(dialog.getByRole('button', { name: 'Authorize note summaries' })).toBeVisible();
});
test('reads order summaries with the same unified site consent', async ({ page }) => {
  await page.goto('/pex');
  await connect(page);
  await expect(page.getByRole('cell', { name: '120000 P20' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'open', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() =>
      Reflect.get(window, '__walletCalls').filter(
        (call: { method: string }) => call.method === 'plabs_sendPrivacyTransaction',
      ),
    ),
  ).toEqual([]);
});

test('explorer uses official pool statistics and transaction data without requesting a private key', async ({
  page,
}) => {
  await page.goto('/explorer');
  await expect(page.getByText('Net shielded: 3125.2093 sUSDC', { exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Private P20', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Explorer search' }).fill(`0x${'b'.repeat(64)}`);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Transaction commitments' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Encrypted', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() =>
      Reflect.get(window, '__walletCalls').some(
        (call: { method: string }) => call.method === 'plabs_requestPrivacyAccess',
      ),
    ),
  ).toBe(false);
});
