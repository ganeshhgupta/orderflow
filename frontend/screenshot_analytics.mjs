import { chromium } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'docs', 'screenshots');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', () => {});
  page.on('pageerror', () => {});

  await page.goto('http://localhost:3005', { waitUntil: 'networkidle', timeout: 15000 });
  await page.evaluate(() => sessionStorage.setItem('of_visited', '1'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Analytics', { exact: true }).first().click({ timeout: 5000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: join(OUT, '05-analytics.png') });
  console.log('✓ 05-analytics.png');

  await browser.close();
})();
