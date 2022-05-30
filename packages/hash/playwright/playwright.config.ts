import { PlaywrightTestConfig, devices } from "@playwright/test";
// const { devices } = require("@replayio/playwright");

const ci = process.env.CI === "true";

const config: PlaywrightTestConfig = {
  forbidOnly: ci,
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // { name: "firefox", use: { ...devices["Replay Firefox"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },

    // TODO: investigate issue with cookie persistence in CI (Ubuntu).
    // GraphQL queries remain unauthenticated after login.
    // { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  reporter: [
    [ci ? "github" : "list"],
    ["html", { open: !ci ? "on-failure" : "never" }],
  ],
  retries: ci ? 2 : 0, // 2 retries in CI compensates flakiness, 0 is more helpful locally
  testDir: "tests",
  use: {
    baseURL: "http://localhost:3000",

    // Playwright docs recommend "on-first-retry" as it is slightly more resource-efficient.
    // We can switch to this option when we have more tests and most of them are stable.
    trace: "retain-on-failure",
  },

  workers: 1, // Concurrent tests break login
  timeout: 1000 * 60 * 60,
  expect: { timeout: 10000 },
};

export default config;
