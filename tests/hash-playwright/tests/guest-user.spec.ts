// eslint-disable-next-line no-restricted-imports
import { test as testTolerateConsoleErrors } from "@playwright/test";

import { resetDb } from "./shared/reset-db";
import { expect, test } from "./shared/runtime";

test.beforeEach(async () => {
  await resetDb();
});

test("guest user navigation to login and signup pages", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL("**/login");

  await expect(page.locator("text=Log in to your account")).toBeVisible();
  await expect(page.locator("text=Create account")).toBeVisible();

  await page.click("text=Create account");

  await page.waitForURL("**/signup");

  await expect(
    page.locator('[placeholder="Enter your email address"]'),
  ).toBeVisible();

  await expect(
    page.locator('button:has-text("Sign up with email")'),
  ).toBeVisible();

  await expect(
    page.locator("text=Already have an account? Log in"),
  ).toBeVisible();

  await Promise.all([page.click("text=Log in"), page.waitForURL("**/login")]);

  await expect(page.locator('h1:has-text("Log In")')).toBeVisible();
});

testTolerateConsoleErrors(
  "incorrect credentials are handled",
  async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/login");

    await expect(page.locator("text=Log in to your account")).toBeVisible();

    await page.fill(
      '[placeholder="Enter your email address"]',
      "helloworld@example.com",
    );

    await page.fill('[type="password"]', "password");

    await page.click('button:has-text("Log in to your account")');

    await expect(
      page.locator("text=The provided credentials are invalid"),
    ).toBeVisible();
  },
);

test("guest user redirected to login page", async ({ page }) => {
  await page.goto("/non/existing/page");

  await page.waitForURL("**/login");

  await expect(page.locator("text=Log in to your account")).toBeVisible();
});
