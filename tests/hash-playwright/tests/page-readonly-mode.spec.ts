import { sleep } from "@local/hash-shared/sleep";

import { loginUsingUi } from "./shared/login-using-ui";
import { resetDb } from "./shared/reset-db";
import { expect, test } from "./shared/runtime";

const placeholderSelector =
  "text=Type / to browse blocks, or @ to browse entities";

test.beforeEach(async () => {
  await resetDb();
});

/**
 * @todo: Re-enable this playwright test when required backend functionality is fixed
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

  await page.waitForURL((url) => !!url.pathname.match(/^\/@[\w-]+\/[\w-]+$/));

  await expect(page.locator('[data-testid="page-sidebar"]')).toBeVisible();

  const blockRegion = page.locator("#root");

  await expect(page.locator(placeholderSelector)).toBeVisible();
  await page.keyboard.type("typing in edit mode");
  await expect(blockRegion.locator("text=typing in edit mode")).toBeVisible();

  await expect(
    blockRegion.locator('[data-testid="block-handle"]').first(),
  ).toBeVisible();

  await page.goto(`${page.url()}?readonly`);

  await expect(page.locator('[data-testid="page-sidebar"]')).not.toBeVisible();

  await blockRegion.locator("p div").click();
  await page.keyboard.type("typing in read-only mode");
  await expect(
    blockRegion.locator("text=typing in read-only mode"),
  ).not.toBeVisible();

  await expect(
    blockRegion.locator('[data-testid="block-handle"]'),
  ).not.toBeVisible();

  // @todo: test read-only mode in the code block once read-only version of code block
  // has been added to block hub
});
