import { resetDb } from "./shared/reset-db";
import { expect, test } from "./shared/runtime";

test.beforeEach(async () => {
  await resetDb();
});

test("user can sign up", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL("**/signin");

  await expect(page.locator("text=SIGN IN TO YOUR ACCOUNT")).toBeVisible();
  await expect(page.locator("text=Create a free account")).toBeVisible();

  await page.click("text=Create a free account");

  await page.waitForURL("**/signup");

  const randomNumber = Math.floor(Math.random() * 10_000)
    .toString()
    .padEnd(4, "0"); // shortnames must be at least 4 characters

  await page.fill(
    '[placeholder="Enter your email address"]',
    `${randomNumber}@example.com`,
  );

  await page.fill('[type="password"]', "some-complex-pw-1ab2");

  await page.click("text=Sign up");

  await expect(
    page.locator("text=Thanks for confirming your account"),
  ).toBeVisible();

  await page.fill('[placeholder="example"]', randomNumber.toString());

  await page.fill('[placeholder="Jonathan Smith"]', "New User");

  await page.click("text=Continue");

  await page.waitForURL("/");

  await expect(page.locator("text=Welcome to HASH")).toBeVisible();
});
