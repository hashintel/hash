import { sleep } from "@local/hash-isomorphic-utils/sleep";
// eslint-disable-next-line no-restricted-imports
import { test as testTolerateConsoleErrors } from "@playwright/test";

import { loginUsingTempForm } from "./shared/login-using-temp-form";
import { resetDb } from "./shared/reset-db";
import { expect, test } from "./shared/runtime";

const pageTitleInputSelector = '[placeholder="Untitled"]';

test.beforeEach(async () => {
  await resetDb();
});

testTolerateConsoleErrors("logged-in user shown 404 page", async ({ page }) => {
  await loginUsingTempForm({
    page,
    userEmail: "alice@example.com",
    userPassword: "password",
  });

  await page.goto("/non/existing/page");
  await expect(page).toHaveTitle("404: This page could not be found");

  await expect(
    page.locator("text=This page could not be found."),
  ).toBeVisible();
});

test("user can toggle nested pages", async ({ page }) => {
  await loginUsingTempForm({ page });

  const selectExpandPageButton = (pageTitle: string) =>
    page.locator(
      `[data-testid="pages-tree"] a:has-text("${pageTitle}") > [data-testid="page-tree-item-expand-button"]`,
    );

  const toggleButtonLevel1 = selectExpandPageButton("First");
  await toggleButtonLevel1.click();

  const toggleButtonLevel2 = selectExpandPageButton("Middle");
  await toggleButtonLevel2.click();

  const leafPage = page.locator(
    `[data-testid="pages-tree"] a:has-text("Leaf")`,
  );

  await expect(leafPage).toBeVisible();

  await sleep(500);
  await leafPage.click();

  await page.waitForURL((url) => !!url.pathname.match(/^\/@[\w-]+\/[\w-]+$/));

  const pageTitle = page.locator(pageTitleInputSelector);

  await expect(pageTitle).toHaveValue("Leaf");
});
