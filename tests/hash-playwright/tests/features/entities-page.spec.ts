import {
  changeSidebarListDisplay,
  expandSidebarSection,
} from "../shared/change-sidebar-list-display";
import { expect, test } from "../shared/runtime";

test("user can visit a page listing entities of a type", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("text=Get support")).toBeVisible();

  await changeSidebarListDisplay({
    displayAs: "list",
    page,
    section: "Entities",
  });

  await expandSidebarSection({ page, section: "Entities" });

  const sidebar = page.getByTestId("page-sidebar");
  const documentItem = sidebar.getByText("Document", { exact: true });
  await expect(documentItem).toBeVisible();
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
