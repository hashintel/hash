import { test, expect } from "@playwright/test";
import { loginUsingUi } from "./utils/loginUsingUi";

test("user can create and update entity", async ({ page }) => {
  await loginUsingUi({ page, accountShortName: "bob" });

  // Check if we are on the user page
  await expect(
    page.locator(
      "text=Please select a page from the list, or create a new page.",
    ),
  ).toBeVisible();

  // Go to Create Entity
  await page.locator('[data-testid="create-entity-btn"]').click();
  await page.waitForURL(
    (url) => !!url.pathname.match(/^\/[\w-]+\/types+\/new/),
  );

  // Create a random entity name for each test
  const entityName = `TestEntity${(Math.random() * 1000).toFixed()}`;

  // Fill up entity creation form
  await page.click('text=NameDescription >> input[type="text"]');
  await page.fill('text=NameDescription >> input[type="text"]', entityName);
  await page.click('main :nth-match(input[type="text"], 2)');
  await page.fill('main :nth-match(input[type="text"], 2)', "Test Entity");

  // Submit entity creation form and wait for page load
  await page.click("text=NameDescriptionCreate Entity Type >> button");
  await page.waitForURL(
    (url) => !!url.pathname.match(/^\/[\w-]+(\/types\/)[\w-]+/),
  );

  // Create a new Property
  await page.click('[placeholder="newProperty"]');
  await page.fill('[placeholder="newProperty"]', "Property1");
  await page.click("text=Create Property");

  // Click on New Entity button to create new instance of entity
  await page.click(`text=New ${entityName}`);
  await page.waitForURL(
    (url) => !!url.pathname.match(/^\/[\w-]+(\/entities\/new)/),
  );

  // Expect the created property to be present
  await expect(page.locator("label[text=Property1]")).toBeVisible();

  // Go back and add another property to the entity
  await page.goBack();

  await page.click('[placeholder="newProperty"]');
  await page.fill('[placeholder="newProperty"]', "Property2");
  await page.click("text=Create Property");

  // Click on New Entity button to create new instance of entity
  await page.click(`text=New ${entityName}`);
  await page.waitForURL(
    (url) => !!url.pathname.match(/^\/[\w-]+(\/entities\/new)/),
  );

  // Expect the newly created property to be present
  await expect(page.locator("text=Property2")).toBeVisible();
});
