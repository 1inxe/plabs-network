import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { mockApis } from './fixtures';

async function expectStableChart(page: Page) {
  const chart = page.locator('.market-chart');
  await expect(chart.locator('canvas').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const sizes = await chart.evaluate(async (element) => {
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    // Let the chart's ResizeObserver apply the new viewport dimensions before measuring.
    await frame();
    await frame();
    const samples: { height: number; documentHeight: number; width: number }[] = [];
    for (let i = 0; i < 90; i++) {
      await frame();
      const rect = element.getBoundingClientRect();
      samples.push({
        height: rect.height,
        documentHeight: document.documentElement.scrollHeight,
        width: rect.width,
      });
    }
    return samples;
  });
  const heights = sizes.map((size) => size.height);
  const documentHeights = sizes.map((size) => size.documentHeight);
  expect(
    Math.max(...heights) - Math.min(...heights),
    'chart must not grow while idle',
  ).toBeLessThanOrEqual(1);
  expect(
    Math.max(...documentHeights) - Math.min(...documentHeights),
    'chart must not stretch the page',
  ).toBeLessThanOrEqual(1);
  expect(Math.min(...heights)).toBeGreaterThan(200);
  await expect
    .poll(() =>
      chart.evaluate((element) => {
        const table = element.querySelector('table')?.getBoundingClientRect();
        const viewport = element.getBoundingClientRect();
        return (
          !!table &&
          Math.abs(table.width - viewport.width) <= 2 &&
          table.height <= viewport.height + 2
        );
      }),
    )
    .toBe(true);
  return sizes[0]?.width ?? 0;
}

test('chart height stays stable through idle frames, view changes, refreshes and window resizing', async ({
  page,
  isMobile,
}) => {
  await mockApis(page);
  await page.goto('/pex');
  const initialWidth = await expectStableChart(page);
  await page.getByRole('radio', { name: 'FDV', exact: true }).click();
  await expectStableChart(page);
  await page.getByRole('button', { name: '1h', exact: true }).click();
  await expectStableChart(page);
  const refresh = page.getByRole('button', { name: 'Refresh market', exact: true });
  if (await refresh.isVisible()) {
    await refresh.click();
    await expectStableChart(page);
  }
  await page.setViewportSize({ width: isMobile ? 360 : 1200, height: 900 });
  const resizedWidth = await expectStableChart(page);
  expect(Math.abs(resizedWidth - initialWidth)).toBeGreaterThan(10);
  if (!isMobile) {
    await page.setViewportSize({ width: 960, height: 900 });
    await expectStableChart(page);
  }
  await page.setViewportSize({ width: isMobile ? 412 : 1440, height: 1080 });
  await expectStableChart(page);
});
