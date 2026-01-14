import { expect, test } from "@playwright/test";
import fetch from "sync-fetch";

const url = "http://localhost:61000";

type LadleMeta = {
  stories: Record<string, { name: string; levels: string[] }>;
};

const { stories } = fetch(`${url}/meta.json`).json() as LadleMeta;

for (const storyKey of Object.keys(stories)) {
  test(`${storyKey} - visual snapshot`, async ({ page }) => {
    await page.goto(`${url}/?story=${storyKey}&mode=preview`, {
      waitUntil: "networkidle",
    });
    await page.waitForSelector("[data-storyloaded]");
    await page.waitForTimeout(100);
    await expect(page).toHaveScreenshot(`${storyKey}.png`);
  });
}
