# fetch_product_images.py — download product thumbnails from Unsplash via Playwright
import asyncio
import os
from playwright.async_api import async_playwright

OUT_DIR = os.path.join(os.path.dirname(__file__), "frontend", "public", "products")

PRODUCTS = [
    "laptop",
    "mechanical-keyboard",
    "4k-monitor",
    "webcam",
    "usb-hub",
    "ssd",
    "ram",
    "gpu",
    "headphones",
    "docking-station",
    "router",
    "microphone",
    "mouse",
    "speaker",
    "thunderbolt-hub",
]


async def fetch_image(page, query: str, out_path: str) -> bool:
    try:
        await page.goto(
            f"https://unsplash.com/s/photos/{query}",
            wait_until="domcontentloaded",
            timeout=20000,
        )
        # First photo link on the search results grid
        img = page.locator('figure img[src*="images.unsplash.com"]').first
        await img.wait_for(timeout=10000)
        src = await img.get_attribute("src")
        if not src:
            return False

        # Strip query params, request a small fixed size
        base = src.split("?")[0]
        sized = f"{base}?w=120&h=120&fit=crop&auto=format&q=75"

        response = await page.request.get(sized)
        if response.ok:
            with open(out_path, "wb") as f:
                f.write(await response.body())
            print(f"  saved {os.path.basename(out_path)}")
            return True
    except Exception as e:
        print(f"  failed {query}: {e}")
    return False


async def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"
        )
        page = await context.new_page()

        for product in PRODUCTS:
            out_path = os.path.join(OUT_DIR, f"{product}.jpg")
            if os.path.exists(out_path):
                print(f"  skip {product} (exists)")
                continue
            print(f"fetching: {product}")
            ok = await fetch_image(page, product, out_path)
            if not ok:
                # fallback: try simpler query
                await fetch_image(page, product.split("-")[0], out_path)
            await asyncio.sleep(1)  # polite crawl rate

        await browser.close()
    print(f"\nDone — images saved to {OUT_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
