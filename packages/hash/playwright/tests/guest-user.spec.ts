import { resetDb } from "./shared/reset-db";
import { expect, test } from "./shared/runtime";

test.beforeEach(async () => {
  await resetDb();
});

/**
 * @todo: Re-enable this playwright test when required backend functionality is fixed
 * @see https://app.asana.com/0/1202805690238892/1203106234191599/f
 */
test.skip("guest user navigation to login and signup pages", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForURL("**/login");

  await expect(page.locator("text=Sign in to your account")).toBeVisible();
  await expect(page.locator("text=No account? No problem")).toBeVisible();

  await page.click("text=No account? No problem");

  await Promise.all([
    page.click("text=Create a free account"),
    page.waitForURL("**/signup"),
  ]);

  await expect(
    page.locator('[placeholder="Enter your email address.."]'),
  ).toBeVisible();

  await expect(
    page.locator('button:has-text("Continue with email")'),
  ).toBeVisible();

  await expect(
    page.locator(
      "text=Alternatively if you already have a HASH account, Click here to log in",
    ),
  ).toBeVisible();

  await Promise.all([
    page.click("text=Click here to log in"),
    page.waitForURL("**/login"),
  ]);

  await expect(
    page.locator('h1:has-text("Sign in to your account")'),
  ).toBeVisible();

  await page.click('[placeholder="Enter your email or shortname"]');

  await page.fill(
    '[placeholder="Enter your email or shortname"]',
    "hello world",
  );

  await page.click('button:has-text("Submit")');

  await page.click(
    "text=A user with the shortname 'hello world' could not be found.",
  );
});

/**
 * @todo: Re-enable this playwright test when required backend functionality is fixed
 * @see https://app.asana.com/0/1202805690238892/1203106234191599/f
 */
test.skip("guest user navigation to inaccessible pages", async ({ page }) => {
  await page.goto("/non/existing/page");
  await expect(page).toHaveTitle("404: This page could not be found");

  await expect(
    page.locator("text=This page could not be found."),
  ).toBeVisible();

  await expect(page.locator("text=Sign InSign Up")).toBeVisible();
});
