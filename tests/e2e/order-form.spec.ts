import { expect, test } from '@playwright/test';
import { connect, mockApis, mockWallet, revokeReadAccess } from './fixtures';

test('an unshared balance has an actionable approval and market sell uses the live bids', async ({
  page,
}) => {
  await mockApis(page);
  await mockWallet(page, true);
  await page.route('**/api/market/book', (route) =>
    route.fulfill({
      json: {
        base_name: 'P20',
        quote_name: 'sUSDC',
        asks: [{ price: '1300', qty: 19000000000 }],
        bids: [
          { price: '1000', qty: 85000000000 },
          { price: '800', qty: 50000000000 },
        ],
        min_fill_size: 0,
      },
    }),
  );
  await page.route('**/api/market/market/stats', (route) =>
    route.fulfill({
      json: {
        as_of_ms: Date.now(),
        fully_diluted_supply: '1000000000',
        vwap_24h: null,
        spot_fdv: '1150000',
        matched_base_volume_24h: '0',
        fdv_change_percent: '+9.5238',
      },
    }),
  );
  await page.goto('/pex');
  await connect(page);
  await revokeReadAccess(page);
  await page.evaluate(() => {
    const provider = Reflect.get(window, 'plabsPrivacyWallet');
    const request = provider.request.bind(provider);
    provider.request = async (args: { method: string }) => {
      const result = await request(args);
      if (args.method === 'plabs_getBalances') {
        result.private.assets = result.private.assets.map((asset: { symbol: string }) =>
          asset.symbol === 'P20'
            ? {
                ...asset,
                totalRaw: '84000000000',
                spendableRaw: '84000000000',
                pendingRaw: '0',
                totalNotes: 1,
                spendableNotes: 1,
              }
            : asset,
        );
      }
      return result;
    };
  });
  await page.getByRole('button', { name: 'Sell P20', exact: true }).click();
  await page.getByRole('radio', { name: 'Market', exact: true }).click();
  await page.getByRole('textbox', { name: 'Order amount' }).fill('84000');
  await expect(page.getByTestId('order-estimate')).toHaveText('84 sUSDC');
  await expect(page.getByText('Settlement is paused', { exact: false })).toHaveCount(0);
  const authorize = page.getByRole('button', { name: 'Authorize balance access', exact: true });
  await expect(authorize).toBeEnabled();
  await authorize.click();
  await expect(page.locator('.available-balance')).toContainText('84000');
  await page.getByRole('button', { name: 'MAX', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Order amount' })).toHaveValue('84000');
  await expect(
    page.getByRole('button', { name: 'Update wallet for PEX trading', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText('Update PLabs Wallet to version 0.7.0', { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      Reflect.get(window, '__walletCalls').filter((call: { method: string }) =>
        ['plabs_sendPrivacyTransaction', 'eth_sendTransaction'].includes(call.method),
      ),
    ),
  ).toEqual([]);
});
test('failed balance authorization stays local and does not trigger a notification', async ({
  page,
}) => {
  await mockApis(page);
  await mockWallet(page, true);
  await page.goto('/pex');
  await connect(page);
  await revokeReadAccess(page);
  await page.evaluate(() => {
    const provider = Reflect.get(window, 'plabsPrivacyWallet');
    const request = provider.request.bind(provider);
    provider.request = (args: { method: string }) => {
      if (args.method === 'plabs_requestPrivacyAccess')
        return Promise.reject(
          Object.assign(new Error('User rejected data access'), { code: 4001 }),
        );
      return request(args);
    };
  });
  await page.getByRole('button', { name: 'Authorize balance access', exact: true }).click();
  const feedback = page.locator('.order-form .wallet-control-feedback');
  await feedback.locator('summary').click();
  await expect(feedback).toContainText('declined');
  await expect(page.locator('.notification-card')).toHaveCount(0);
  await expect(page.locator('.order-form [role=alert]')).toHaveCount(0);
});

test('PEX capable wallet receives a bounded sell intent and exposes follow-up actions', async ({
  page,
}) => {
  await mockApis(page);
  await mockWallet(page, true);
  await page.goto('/pex');
  await page.evaluate(() => {
    const provider = Reflect.get(window, 'plabsPrivacyWallet');
    const request = provider.request.bind(provider);
    provider.request = async (args: { method: string; params?: unknown[] }) => {
      if (args.method === 'plabs_placeDexOrder') {
        Reflect.get(window, '__walletCalls').push(args);
        return {
          id: '11111111-2222-3333-4444-555555555555',
          localId: '11111111-2222-3333-4444-555555555555',
          side: 'sell',
          type: 'market',
          quantityRaw: '10000000',
          priceTicks: '700',
          executionState: 'funding',
          status: 'pending',
          canResume: true,
          canCancel: true,
          error: 'Funding pending. Check this order before creating another.',
        };
      }
      if (args.method === 'plabs_resumeDexOrder') {
        Reflect.get(window, '__walletCalls').push(args);
        return {
          id: 'd'.repeat(32),
          localId: '11111111-2222-3333-4444-555555555555',
          executionState: 'open',
          canResume: true,
          canCancel: true,
        };
      }
      const result = await request(args);
      if (args.method === 'plabs_getCapabilities') result.methods.dexTrading = true;
      if (args.method === 'plabs_getBalances')
        result.private.assets = result.private.assets.map((asset: { symbol: string }) =>
          asset.symbol === 'P20'
            ? {
                ...asset,
                totalRaw: '84000000000',
                spendableRaw: '84000000000',
                pendingRaw: '0',
                syncState: 'complete',
              }
            : asset,
        );
      return result;
    };
  });
  await connect(page);
  await revokeReadAccess(page);
  await page.getByRole('button', { name: 'Sell P20', exact: true }).click();
  await page.getByRole('radio', { name: 'Market', exact: true }).click();
  await page.getByRole('button', { name: 'Authorize balance access', exact: true }).click();
  await page.getByRole('textbox', { name: 'Order amount' }).fill('10');
  const submit = page.getByRole('button', { name: 'Review sell order', exact: true });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText('Confirming funds', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Order amount' })).toHaveValue('');
  const calls = await page.evaluate(() =>
    Reflect.get(window, '__walletCalls').filter(
      (call: { method: string }) => call.method === 'plabs_placeDexOrder',
    ),
  );
  expect(calls).toHaveLength(1);
  expect(calls[0].params).toEqual([
    {
      chainId: '0x8f',
      side: 'sell',
      type: 'market',
      quantityRaw: '10000000',
      priceTicks: '700',
      maxFeeRaw: '500000',
    },
  ]);
  await page.getByRole('button', { name: 'Resume request', exact: true }).click();
  await expect(page.getByText('Order submitted', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Cancel & recover funds', exact: true }),
  ).toBeVisible();
});

test('a saved funding request is not an open order and resume moves the same request onto the book', async ({
  page,
}) => {
  await mockApis(page);
  await mockWallet(page, true);
  await page.goto('/pex');
  await page.evaluate(() => {
    const provider = Reflect.get(window, 'plabsPrivacyWallet');
    const request = provider.request.bind(provider);
    let resumed = false;
    const summary = () => ({
      id: resumed ? 'a'.repeat(32) : '11111111-2222-3333-4444-555555555555',
      localId: '11111111-2222-3333-4444-555555555555',
      managed: true,
      side: 'sell',
      type: 'limit',
      quantityRaw: '10000000000',
      priceTicks: '1300',
      createdAt: 1,
      epoch: 'epoch',
      status: resumed ? 'open' : 'pending',
      executionState: resumed ? 'open' : 'funding',
      matchedRaw: resumed ? '0' : null,
      pendingRaw: resumed ? '0' : null,
      remainingRaw: resumed ? '10000000000' : null,
      canResume: true,
      canCancel: true,
      fundingProgress: [
        { asset: 'sUSDC', state: 'confirmed' },
        { asset: 'P20', state: resumed ? 'confirmed' : 'indexing' },
      ],
    });
    provider.request = async (args: { method: string }) => {
      if (args.method === 'plabs_getDexOrders')
        return {
          orders: [summary()],
          source: 'official-matcher',
          fetchedAt: Date.now(),
          importedAt: null,
          needsImport: false,
          canPlaceOrders: true,
        };
      if (args.method === 'plabs_resumeDexOrder') {
        Reflect.get(window, '__walletCalls').push(args);
        resumed = true;
        return summary();
      }
      const result = await request(args);
      if (args.method === 'plabs_getCapabilities') result.methods.dexTrading = true;
      return result;
    };
  });
  await connect(page);
  const panel = page.locator('.orders-panel');
  await expect(panel.getByRole('button', { name: 'Open orders 0', exact: true })).toBeVisible();
  await expect(panel.getByText('No open orders', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Pending requests 1', exact: true }).click();
  await expect(panel.getByText('Confirming funds', { exact: true })).toBeVisible();
  await expect(panel.getByLabel('Funding progress')).toContainText('Awaiting indexer');
  const resume = panel.getByRole('button', { name: 'Resume request', exact: true });
  const cancel = panel.getByRole('button', { name: 'Cancel & recover', exact: true });
  const a = await resume.boundingBox(),
    b = await cancel.boundingBox();
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  if (!a || !b) throw new Error('Order actions must be visible');
  expect(b.x >= a.x + a.width + 7 || b.y >= a.y + a.height + 7).toBe(true);
  await expect(page.locator('.notification-card')).toHaveCount(0);
  await panel.screenshot({ path: test.info().outputPath('pending-request.png') });
  await resume.click();
  await expect(
    panel.getByRole('button', { name: 'Pending requests 0', exact: true }),
  ).toBeVisible();
  await panel.getByRole('button', { name: 'Open orders 1', exact: true }).click();
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await expect(panel.locator('tbody')).toContainText('10000 P20');
  expect(
    await page.evaluate(() =>
      Reflect.get(window, '__walletCalls').filter(
        (call: { method: string }) => call.method === 'plabs_placeDexOrder',
      ),
    ),
  ).toEqual([]);
});
