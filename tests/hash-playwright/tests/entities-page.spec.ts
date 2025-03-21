import { changeSidebarListDisplay } from "./shared/change-sidebar-list-display";
import { loginUsingTempForm } from "./shared/login-using-temp-form";
import { resetDb } from "./shared/reset-db";
import { expect, test } from "./shared/runtime";

test.beforeEach(async () => {
  await resetDb();
});

test("user can visit a page listing entities of a type", async ({ page }) => {
  await loginUsingTempForm({
    page,
    userEmail: "alice@example.com",
    userPassword: "password",
  });

  // Check if we are on the logged-in homepage
  await expect(page.locator("text=Get support")).toBeVisible();

  // Enable the full list display for 'Entities' in the sidebar
  await changeSidebarListDisplay({
    displayAs: "list",
    page,
    section: "Entities",
  });

  // Expand the entities list in the sidebar
  await page.locator("text=Entities").first().click();

  // Click on 'Document' in the entities list
  await page.locator("text=Document").first().click();

  // Check if we are on the 'Document' entities page
  await page.waitForURL((url) => {
    return (
      url.pathname === "/entities" &&
      url.search ===
        "?entityTypeIdOrBaseUrl=https://hash.ai/@h/types/entity-type/document/"
    );
  });

  // Confirm that a non-zero number of Document entities are listed for the user
  await expect(page.getByText(/^([1-9]\d*) in your webs$/)).toBeVisible();
});
