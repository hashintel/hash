import { changeSidebarListDisplay } from "../shared/change-sidebar-list-display";
import { expect, test } from "../shared/runtime";

test("user can visit a page listing entities of a type", async ({ page }) => {
  await page.goto("/");
  // Check if we are on the logged-in homepage
  await expect(page.locator("text=Get support")).toBeVisible();

  // Enable the full list display for 'Entities' in the sidebar
  await changeSidebarListDisplay({
    displayAs: "list",
    page,
    section: "Entities",
  });

  // Expand the entities list in the sidebar and wait for types to load
  await page.locator("text=Entities").first().click();

  const documentItem = page.locator("text=Document").first();
  await expect(documentItem).toBeVisible({ timeout: 10_000 });
  await documentItem.click();

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
