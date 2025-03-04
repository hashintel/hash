import { sleep } from "@local/hash-isomorphic-utils/sleep";

import { changeSidebarListDisplay } from "./shared/change-sidebar-list-display";
import { loginUsingTempForm } from "./shared/login-using-temp-form";
import { resetDb } from "./shared/reset-db";
import { expect, test } from "./shared/runtime";

test.beforeEach(async () => {
  await resetDb();
});

test("user can create entity type", async ({ page }) => {
  await loginUsingTempForm({
    page,
    userEmail: "alice@example.com",
    userPassword: "password",
  });

  // Check if we are on the user page
  await expect(page.locator("text=Get support")).toBeVisible();

  // Enable the full list display for 'Types' in the sidebar
  await changeSidebarListDisplay({
    displayAs: "list",
    page,
    section: "Types",
  });

  // Go to Create Entity Type
  await page.locator('[data-testid="create-entity-type-btn"]').click();
  await page.waitForURL(
    (url) => !!url.pathname.match(/^\/new\/types\/entity-type/),
  );

  // Create a random entity type name for each test
  const entityTypeName = `TestEntity${(Math.random() * 1000).toFixed()}`;

  // Fill up entity creation form
  await page.fill(
    '[data-testid=entity-type-creation-form] input[name="title"]',
    entityTypeName,
  );
  await page.fill(
    '[data-testid=entity-type-creation-form] textarea[name="description"]',
    "Test Entity",
  );
  await page.fill(
    '[data-testid=entity-type-creation-form] input[name="titlePlural"]',
    `${entityTypeName}s`,
  );

  // Submit entity creation form and wait for page load
  await page.click("[data-testid=entity-type-creation-form] button");
  await page.waitForURL(
    (url) =>
      !!url.pathname.match(/^\/@alice\/types\/entity-type\/testentity/) &&
      url.searchParams.has("draft"),
  );

  // Add a link type

  await page.click("text=Add a link");

  await page.click('[data-testid="type-selector"] input');

  await page.getByTestId("selector-autocomplete-option").first().click();

  // Ensure the type selector has been un-mounted
  await expect(page.locator('[data-testid="type-selector"]')).not.toBeVisible();

  // Add a property type

  await page.click("text=Add a property");

  await page.click('[data-testid="type-selector"] input');

  await page.getByTestId("selector-autocomplete-option").first().click();

  await expect(page.locator('[data-testid="type-selector"]')).not.toBeVisible();

  // Publish the entity type

  await page.click('[data-testid="editbar-confirm"]');

  await sleep(5_000);

  await page.waitForURL(
    (url) => !!url.pathname.endsWith(entityTypeName.toLowerCase()),
  );
});
