import { chromium } from "@playwright/test";

const baseURL = "http://localhost:3000";

/**
 * Sign in the pre-seeded `alice` user once before the suite runs and
 * persist her session to `tests/.auth/alice.json`. Feature tests that
 * need an authenticated user load this `storageState` instead of
 * repeating the sign-in flow.
 */
export default async function globalSetup() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  await page.goto("/signin");
  await page.fill(
    '[placeholder="Enter your email address"]',
    "alice@example.com",
  );
  await page.fill('[type="password"]', "password");
  await page.click("text=Submit");
  await page.waitForURL("/", { timeout: 30_000 });

  await context.storageState({ path: "tests/.auth/alice.json" });

  await browser.close();
}
