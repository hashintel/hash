import { expect, test } from "@playwright/test";

const defaultBaseUrl = "http://localhost:61000";

type StorybookIndex = {
  entries: Record<string, { id: string; type: string }>;
};

let storyIds: string[] = [];

test.beforeAll(async ({ request, baseURL }) => {
  const targetBaseUrl = baseURL ?? defaultBaseUrl;
  const response = await request.get(`${targetBaseUrl}/index.json`);

  if (!response.ok()) {
    throw new Error(
      `Failed to fetch Storybook index from ${targetBaseUrl}/index.json (status ${response.status()})`,
    );
  }

  const { entries } = (await response.json()) as StorybookIndex;
  storyIds = Object.values(entries ?? {})
    .filter((entry) => entry.type === "story")
    .map((entry) => entry.id);

  if (storyIds.length === 0) {
    throw new Error("Storybook index contained no stories");
  }
});

test("visual snapshots", async ({ page, baseURL }) => {
  // One navigation per story; the fixed 30s test budget can't cover them all
  test.setTimeout(60_000 + storyIds.length * 5_000);

  const targetBaseUrl = baseURL ?? defaultBaseUrl;

  for (const storyId of storyIds) {
    await test.step(storyId, async () => {
      await page.goto(
        `${targetBaseUrl}/iframe.html?id=${storyId}&viewMode=story`,
        { waitUntil: "networkidle" },
      );
      await page.waitForFunction(() => {
        const root = document.querySelector("#storybook-root");
        return root !== null && root.childNodes.length > 0;
      });
      await page.waitForTimeout(100);
      await expect(page).toHaveScreenshot(`${storyId}.png`);
    });
  }
});
