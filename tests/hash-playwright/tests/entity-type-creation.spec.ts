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

  // Click on New Entity button to create new instance of entity
  // @todo uncomment when API is sped up (this page relies on very slow queryEntityTypes and queryPropertyTypes calls)
  // await page.click('[data-testid="editbar-confirm"]');
  // await page.waitForURL(
  //   (url) =>
  //     !!url.pathname.match(
  //       /^\/@alice\/types\/entity-type\/testentity/,
  //     ) && !url.searchParams.has("draft"),
  // );
});
