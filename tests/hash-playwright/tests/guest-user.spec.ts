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

  await expect(page.locator("text=SIGN IN TO YOUR ACCOUNT")).toBeVisible();
  await expect(page.locator("text=Create a free account")).toBeVisible();

  await page.click("text=Create a free account");

  await page.waitForURL("**/signup");

  await expect(
    page.locator('[placeholder="Enter your email address"]'),
  ).toBeVisible();

  await expect(page.locator('button:has-text("Sign up")')).toBeVisible();

  await expect(
    page.locator("text=Already have an account? Sign in"),
  ).toBeVisible();

  await page.click("text=Sign In");

  await page.waitForURL("**/login");

  await expect(page.locator("text=SIGN IN TO YOUR ACCOUNT")).toBeVisible();
});

testTolerateConsoleErrors(
  "incorrect credentials are handled",
  async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/login");

    await expect(page.locator("text=SIGN IN TO YOUR ACCOUNT")).toBeVisible();

    await page.fill(
      '[placeholder="Enter your email address"]',
      "helloworld@example.com",
    );

    await page.fill('[type="password"]', "password");

    await page.click('button:has-text("Submit")');

    await expect(
      page.locator("text=The provided credentials are invalid"),
    ).toBeVisible();
  },
);

test("guest user redirected to login page", async ({ page }) => {
  await page.goto("/non/existing/page");

  await page.waitForURL("**/login");

  await expect(page.locator("text=SIGN IN TO YOUR ACCOUNT")).toBeVisible();
});
