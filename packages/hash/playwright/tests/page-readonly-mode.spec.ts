import { test, expect } from "@playwright/test";
import { loginUsingUi } from "./utils/loginUsingUi";

const pageName = "Untitled";
const pageTitleInputSelector = '[placeholder="A title for the page"]';

test("user can view page in read-only mode but not update", async ({
  page,
}) => {
  await loginUsingUi({
    page,
    accountShortName: "alice",
  });

  // Create the new page
  await page.locator('[data-testid="create-page-btn"]').click();

  await page.waitForURL((url) => !!url.pathname.match(/^\/[\w-]+\/[\w-]+$/));

  await expect(page.locator(pageTitleInputSelector)).toHaveValue(pageName);

  await expect(page.locator('[data-testid="page-sidebar"]')).toBeVisible();

  const blockRegionLocator = page.locator("#root");

  await blockRegionLocator.locator("p div").click();
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
