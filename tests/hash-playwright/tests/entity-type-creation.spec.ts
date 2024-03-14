import { sleep } from "@local/hash-isomorphic-utils/sleep";

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
  await expect(page.locator("text=Welcome to HASH")).toBeVisible();

  // Go to Create Entity Type
  await page.locator('[data-testid="create-entity-type-btn"]').click();
  await page.waitForURL(
    (url) => !!url.pathname.match(/^\/new\/types\/entity-type/),
  );

  // Create a random entity name for each test
  const entityName = `TestEntity${(Math.random() * 1000).toFixed()}`;

  // Fill up entity creation form
  await page.fill(
    '[data-testid=entity-type-creation-form] input[name="name"]',
    entityName,
  );
  await page.fill(
    '[data-testid=entity-type-creation-form] textarea[name="description"]',
    "Test Entity",
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

  const ontologyChipPath = await page
    .locator('[data-testid="ontology-chip-path"]')
    .innerText();

  expect(ontologyChipPath.endsWith("v/1")).toBeTruthy();
});
