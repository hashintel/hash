import { mkdirSync } from "node:fs";

import { chromium } from "@playwright/test";

const baseURL = "http://localhost:3000";

const signInAndSaveState = async (
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  email: string,
  statePath: string,
) => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  await page.goto("/signin");
  await page.fill('[placeholder="Enter your email address"]', email);
  await page.fill('[type="password"]', "password");
  await page.click("text=Submit");
  await page.waitForURL("/", { timeout: 30_000 });

  await context.storageState({ path: statePath });
  await context.close();
};

/**
 * Sign in the pre-seeded users once before the suite runs and persist
 * their sessions. Feature tests load a `storageState` instead of
 * repeating the sign-in flow.
 *
 * Multiple users are needed so that tests which mutate user state
 * (e.g. sidebar preferences) can run in parallel without conflicting
 * on the same entity.
 */
export default async function globalSetup() {
  mkdirSync("tests/.auth", { recursive: true });

  const browser = await chromium.launch();
  try {
    await signInAndSaveState(
      browser,
      "alice@example.com",
      "tests/.auth/alice.json",
    );
    await signInAndSaveState(
      browser,
      "bob@example.com",
      "tests/.auth/bob.json",
    );
  } finally {
    await browser.close();
  }
}
