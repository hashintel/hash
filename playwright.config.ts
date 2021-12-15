import { PlaywrightTestConfig, devices } from "@playwright/test";

const config: PlaywrightTestConfig = {
  forbidOnly: !!process.env.CI,
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },

    // TODO: investigate issue with cookie persistence in CI (Ubuntu).
    // GraphQL queries remain unauthenticated after login.
    // { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  reporter: [
    [process.env.CI ? "github" : "list"],
    ["html", { open: !process.env.CI ? "on-failure" : "never" }],
  ],
  retries: 1,
  testDir: "tests",
  use: {
    baseURL: "http://localhost:3000",

    // Playwright docs recommend "on-first-retry" as it is slightly more resource-efficient.
    // We can switch to this option when we have more tests and most of them are stable.
    trace: "retain-on-failure",
  },
};

export default config;
