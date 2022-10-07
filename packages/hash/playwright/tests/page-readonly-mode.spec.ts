import { sleep } from "@hashintel/hash-shared/sleep";
import { test, expect } from "@playwright/test";
import { loginUsingUi } from "./utils/login-using-ui";
import { resetDb } from "./utils/reset-db";

const placeholderSelector =
  "text=Type / to browse blocks, or @ to browse entities";

test.beforeEach(async () => {
  await resetDb();
});

/**
 * @todo: Re-enable this playwright test when required workspace functionality is fixed
 * @see https://app.asana.com/0/1202805690238892/1203106234191599/f
 */
test.skip("user can view page in read-only mode but not update", async ({
  page,
}) => {
  await loginUsingUi({
    page,
    accountShortName: "alice",
  });

  // TODO: investigate why delay is required for create page button to work
  await sleep(500);
  await page.locator('[data-testid="create-page-btn"]').click();

  await page.waitForURL((url) => !!url.pathname.match(/^\/[\w-]+\/[\w-]+$/));

  await expect(page.locator('[data-testid="page-sidebar"]')).toBeVisible();

  const blockRegionLocator = page.locator("#root");

  await expect(page.locator(placeholderSelector)).toBeVisible();
  await page.keyboard.type("typing in edit mode");
  await expect(
    blockRegionLocator.locator("text=typing in edit mode"),
  ).toBeVisible();

  await expect(
    blockRegionLocator.locator('[data-testid="block-handle"]').first(),
  ).toBeVisible();

  await page.goto(`${page.url()}?readonly`);

  await expect(page.locator('[data-testid="page-sidebar"]')).not.toBeVisible();

  await blockRegionLocator.locator("p div").click();
  await page.keyboard.type("typing in read-only mode");
  await expect(
    blockRegionLocator.locator("text=typing in read-only mode"),
  ).not.toBeVisible();

  await expect(
    blockRegionLocator.locator('[data-testid="block-handle"]'),
  ).not.toBeVisible();

  // @todo: test read-only mode in the code block once read-only version of code block
  // has been added to block hub
});
