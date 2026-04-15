import type { PlaywrightTestConfig } from "@playwright/test";
import { devices } from "@playwright/test";

const ci = process.env.CI === "true";

const config: PlaywrightTestConfig = {
  forbidOnly: ci,
  globalSetup: "./global-setup",
  projects: [
    {
      name: "account",
      testMatch: "tests/account/**",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "features",
      testMatch: "tests/features/**",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/.auth/alice.json",
      },
      dependencies: ["account"],
    },
    {
      name: "guest",
      testMatch: "tests/guest/**",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "extension",
      testMatch: "tests/extension/**",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  reporter: [
    [ci ? "github" : "list"],
    ["html", { open: !ci ? "on-failure" : "never" }],
  ],
  testDir: "tests",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
};

export default config;
