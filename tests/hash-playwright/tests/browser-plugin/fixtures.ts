import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { type BrowserContext, chromium, test as base } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const monorepoRootDir = path.resolve(__dirname, "../../../../");

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const pathToExtension = path.join(
      monorepoRootDir,
      "apps/plugin-browser/build",
    );
    const context = await chromium.launchPersistentContext("", {
      headless: false,
      args: [
        `--headless=new`,
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
      serviceWorkers: "allow",
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent("serviceworker");
    }

    const extensionId = background.url().split("/")[2];
    if (!extensionId) {
      throw new Error("Could not find extension ID");
    }
    await use(extensionId);
  },
});

export const expect = test.expect;
