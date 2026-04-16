import { changeSidebarListDisplay } from "../shared/change-sidebar-list-display";
import { expect, test } from "../shared/runtime";

test("user can visit a page listing entities of a type", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("text=Get support")).toBeVisible();

  await changeSidebarListDisplay({
    displayAs: "list",
    page,
    section: "Entities",
  });

  const sidebar = page.getByTestId("page-sidebar");

  // Expand the entities list in the sidebar
  await sidebar.getByText("Entities", { exact: true }).click();

  // Wait for entity types to load inside the expanded section
  const documentItem = sidebar.getByText("Document", { exact: true });
  await expect(documentItem).toBeVisible({ timeout: 10_000 });
  await documentItem.click();

  await page.waitForURL((url) => {
    return (
      url.pathname === "/entities" &&
      url.search ===
        "?entityTypeIdOrBaseUrl=https://hash.ai/@h/types/entity-type/document/"
    );
  });

  await expect(page.getByText(/^([1-9]\d*) in your webs$/)).toBeVisible();
});
