import type { PlaywrightTestConfig } from "@playwright/test";
import { devices } from "@playwright/test";

const ci = process.env.CI === "true";

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
  snapshotDir: "tests/__snapshots__",
  // Use platform/browser-agnostic snapshot names (just the test name)
  snapshotPathTemplate: "{snapshotDir}/{arg}{ext}",
  use: {
    baseURL: "http://localhost:61000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "yarn ladle preview -p 61000",
    url: "http://localhost:61000",
    reuseExistingServer: !ci,
    timeout: 120_000,
  },
};

export default config;
