import {
  changeSidebarListDisplay,
  expandSidebarSection,
} from "../shared/change-sidebar-list-display";
import {
  addParent,
  addProperty,
  createEntityType,
  parentCard,
  propertyRow,
  publishDraftEntityType,
  randomTypeName,
  startDraftEntityType,
} from "../shared/entity-type-editor";
import { expect, test } from "../shared/runtime";

// Use bob so that sidebar-preference mutations don't conflict with
// entities-page.spec.ts (which runs as alice) on the same entity.
test.use({ storageState: "tests/.auth/bob.json" });

test("user can create entity type", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("text=Get support")).toBeVisible();

  await changeSidebarListDisplay({
    displayAs: "list",
    page,
    section: "Types",
  });

  await expandSidebarSection({ page, section: "Types" });

  const sidebar = page.getByTestId("page-sidebar");
  const createBtn = sidebar.getByTestId("create-entity-type-btn");
  await expect(createBtn).toBeVisible();
  await createBtn.click();
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
      !!url.pathname.match(/^\/@example-org\/types\/entity-type\/testentity/) &&
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

  await page.waitForURL(
    (url) => !!url.pathname.endsWith(entityTypeName.toLowerCase()),
  );
});

test("user can create an entity type that extends another", async ({
  page,
}) => {
  const parentName = randomTypeName();
  await createEntityType(page, parentName);

  const childName = randomTypeName();
  await startDraftEntityType(page, childName);

  await addParent(page, parentName);

  const childPath = await publishDraftEntityType(page, childName);

  await page.goto(childPath);
  await expect(parentCard(page, parentName)).toBeVisible();
});

test("user can create an entity type with a named property", async ({
  page,
}) => {
  const typeName = randomTypeName();
  await startDraftEntityType(page, typeName);

  await addProperty(page, "Description");

  const typePath = await publishDraftEntityType(page, typeName);

  await page.goto(typePath);
  await expect(propertyRow(page, "Description")).toHaveCount(1);
});
