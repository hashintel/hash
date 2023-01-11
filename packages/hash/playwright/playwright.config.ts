import { devices, PlaywrightTestConfig } from "@playwright/test";

const ci = process.env.CI === "true";

const config: PlaywrightTestConfig = {
  forbidOnly: ci,
  // TODO: Investigate test performance issues
  timeout: 60000,
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // We plan to add more browsers and also split Playwright tests into
    // system (integration) tests and end-to-end tests.
    // Re-enabling multiple browsers is tracked in:
    // https://app.asana.com/0/1201095311341924/1203280843875283/f (internal)
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
};

export default config;
