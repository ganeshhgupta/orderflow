// screenshot.mjs — Playwright screenshots for OrderFlow README
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3005';

async function ss(page, name, waitMs = 2000) {
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
  console.log(`✓ ${name}`);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', () => {});
  page.on('pageerror', () => {});

  // 1. Landing page (unauthenticated)
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  await ss(page, '01-landing', 2000);

  // Bypass auth gate: set sessionStorage then reload
  await page.evaluate(() => sessionStorage.setItem('of_visited', '1'));
  await page.reload({ waitUntil: 'networkidle' });
  await ss(page, '02-overview', 3000);

  // Helper: click sidebar nav item by text
  async function nav(label, name, waitMs = 2500) {
    // Sidebar nav items — find by text content
    const item = page.locator(`[data-nav="${label}"]`).first();
    if (await item.count() > 0) {
      await item.click();
    } else {
      // fallback: find button/span with the text
      await page.evaluate((lbl) => {
        // Trigger nav by looking for nav links
        const el = [...document.querySelectorAll('button, [role="button"], li, div')]
          .find(e => e.textContent?.trim() === lbl || e.textContent?.includes(lbl));
        if (el) el.click();
      }, label);
    }
    await ss(page, name, waitMs);
  }

  // Sidebar items use onClick handlers — easier to click by visible text in sidebar
  const navItems = [
    { text: 'Orders',        file: '03-orders'    },
    { text: 'Catalog',       file: '04-catalog'   },
    { text: 'Analytics',     file: '05-analytics', wait: 4000 },
    { text: 'Failed Orders', file: '06-dlq'       },
    { text: 'MRP Planning',  file: '07-mrp'       },
    { text: 'MRP Logs',      file: '08-logs'      },
    { text: 'Event Stream',  file: '09-events', wait: 3000 },
    { text: 'About',         file: '10-about'     },
    { text: 'Demo',          file: '11-demo'      },
  ];

  for (const { text, file, wait } of navItems) {
    try {
      await page.getByText(text, { exact: true }).first().click({ timeout: 5000 });
      await ss(page, file, wait ?? 2500);
    } catch (e) {
      console.log(`⚠ skipped ${file}: ${e.message.split('\n')[0]}`);
    }
  }

  // Cart interaction: go to catalog, add item, open cart
  try {
    await page.getByText('Catalog', { exact: true }).first().click({ timeout: 5000 });
    await page.waitForTimeout(2000);
    // Find any "Add to Cart" button
    const addBtns = page.locator('button').filter({ hasText: /add to cart/i });
    if (await addBtns.count() > 0) {
      await addBtns.first().click();
      await page.waitForTimeout(800);
      // Find cart button in header
      const cartBtn = page.locator('button').filter({ hasText: /cart/i });
      if (await cartBtn.count() > 0) {
        await cartBtn.first().click();
        await ss(page, '12-cart', 1000);
      }
    }
  } catch (e) {
    console.log(`⚠ cart skipped: ${e.message.split('\n')[0]}`);
  }

  // New Order modal (press 'n')
  try {
    await page.getByText('Overview', { exact: true }).first().click({ timeout: 5000 });
    await page.waitForTimeout(1000);
    await page.keyboard.press('n');
    await ss(page, '13-new-order-modal', 1500);
    await page.keyboard.press('Escape');
  } catch (e) {
    console.log(`⚠ modal skipped: ${e.message.split('\n')[0]}`);
  }

  await browser.close();
  console.log(`\nAll screenshots saved to: ${OUT}`);
})();
