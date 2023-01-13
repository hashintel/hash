import { loginUsingTempForm } from "./shared/login-using-temp-form";
import { resetDb } from "./shared/reset-db";
import { expect, test } from "./shared/runtime";

test.beforeEach(async () => {
  await resetDb();
});

/**
 * @todo: Re-enable this playwright test when required backend functionality is fixed
 * @see https://app.asana.com/0/1202805690238892/1203106234191599/f
 */
test.skip("user can create and update entity", async ({ page }) => {
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
    (url) => !!url.pathname.match(/^\/types\/new\/entity-type/),
  );

  // Create a random entity name for each test
  const entityName = `TestEntity${(Math.random() * 1000).toFixed()}`;

  // Fill up entity creation form
  await page.fill(
    '[data-testid=entity-type-creation-form] input[name="name"]',
    entityName,
  );
  await page.fill(
    '[data-testid=entity-type-creation-form] input[name="description"]',
    "Test Entity",
  );

  // Submit entity creation form and wait for page load
  await page.click("[data-testid=entity-type-creation-form] button");
  await page.waitForURL(
    (url) =>
      !!url.pathname.match(/^\/@alice\/types\/entity-type\/testentity\d{3}/) &&
      url.searchParams.has("draft"),
  );

  // Insert the first property
  await page.click('[data-testid="empty-property-card"]');
  await page.click('[data-testid="property-selector-option"]:first-child');

  // Click on New Entity button to create new instance of entity
  await page.click('[data-testid="editbar-confirm"]');
  await page.waitForURL(
    (url) =>
      !!url.pathname.match(/^\/@alice\/types\/entity-type\/testentity\d{3}/) &&
      !url.searchParams.has("draft"),
  );
});
