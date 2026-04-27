import type { PlaywrightTestConfig } from "@playwright/test";
import { devices } from "@playwright/test";

const ci = process.env.CI === "true";

// Flow-based test groups. Each entry becomes a project per browser
// (currently Chrome only; add Firefox/WebKit entries to `browsers`
// below to widen the matrix).
const flows = [
  { name: "account", testMatch: "tests/account/**" },
  {
    name: "features",
    testMatch: "tests/features/**",
    extra: { storageState: "tests/.auth/alice.json" },
  },
  { name: "guest", testMatch: "tests/guest/**" },
] as const;

const browsers = [
  { suffix: "chromium", device: devices["Desktop Chrome"] },
  { suffix: "firefox", device: devices["Desktop Firefox"] },
  { suffix: "webkit", device: devices["Desktop Safari"] },
];

const config: PlaywrightTestConfig = {
  forbidOnly: ci,
  globalSetup: "./global-setup",
  projects: [
    // Browser-matrix projects generated from flows × browsers.
    ...browsers.flatMap(({ suffix, device }) =>
      flows.map((flow) => ({
        name: `${flow.name}-${suffix}`,
        testMatch: flow.testMatch,
        use: { ...device, ...("extra" in flow ? flow.extra : {}) },
      })),
    ),
    // Extension tests use a custom persistent-context fixture and only
    // run on Chromium (Chrome extension API).
    {
      name: "extension-chromium",
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
