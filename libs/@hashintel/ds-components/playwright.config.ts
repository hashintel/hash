import { devices } from "@playwright/test";

import type { PlaywrightTestConfig } from "@playwright/test";

const { CI, PORT } = process.env;

const ci = CI === "true";
const port = Number(PORT ?? 61000);

const config: PlaywrightTestConfig = {
  forbidOnly: ci,
  timeout: 30_000,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  reporter: [
    [ci ? "github" : "list"],
    ["html", { open: ci ? "never" : "on-failure" }],
  ],
  retries: ci ? 2 : 0,
  testDir: "tests",
  // Only the Playwright suite; tests/*.test.ts are vitest files
  testMatch: "snapshots.spec.ts",
  snapshotDir: "tests/__snapshots__",
  // Use platform/browser-agnostic snapshot names (just the test name)
  snapshotPathTemplate: "{snapshotDir}/{arg}{ext}",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `yarn vite preview --outDir .build/storybook --strictPort --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !ci,
    timeout: 120_000,
  },
};

export default config;
