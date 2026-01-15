import { expect, test } from "@playwright/test";

const defaultBaseUrl = "http://localhost:61000";

type LadleMeta = {
  stories: Record<string, { name: string; levels: string[] }>;
};

let storyKeys: string[] = [];

test.beforeAll(async ({ request, baseURL }) => {
  const targetBaseUrl = baseURL ?? defaultBaseUrl;
  const response = await request.get(`${targetBaseUrl}/meta.json`);

  if (!response.ok()) {
    throw new Error(
      `Failed to fetch Ladle meta from ${targetBaseUrl}/meta.json (status ${response.status()})`,
    );
  }

  const { stories } = (await response.json()) as LadleMeta;
  storyKeys = Object.keys(stories ?? {});

  if (storyKeys.length === 0) {
    throw new Error("Ladle meta contained no stories");
  }
});

test("visual snapshots", async ({ page, baseURL }) => {
  const targetBaseUrl = baseURL ?? defaultBaseUrl;

  for (const storyKey of storyKeys) {
    await test.step(storyKey, async () => {
      await page.goto(`${targetBaseUrl}/?story=${storyKey}&mode=preview`, {
        waitUntil: "networkidle",
      });
      await page.waitForSelector("[data-storyloaded]");
      await page.waitForTimeout(100);
      await expect(page).toHaveScreenshot(`${storyKey}.png`);
    });
  }
});
