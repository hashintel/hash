import { PlaywrightTestConfig, devices } from "@playwright/test";

const config: PlaywrightTestConfig = {
  forbidOnly: !!process.env.CI,
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  reporter: [[process.env.CI ? "github" : "list"], ["html", { open: "never" }]],
  retries: 1,
  testDir: "tests",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
};

export default config;
