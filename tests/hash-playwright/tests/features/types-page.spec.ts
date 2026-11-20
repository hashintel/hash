import { frontendUrl } from "@local/hash-isomorphic-utils/environment";

import { expect, test } from "../shared/runtime";

const pathPrefix = `${frontendUrl}/types/`;

test("/types page renders and loads types", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("text=Get support")).toBeVisible();

  await page.goto("/types");

  await page.waitForURL((url) => url.pathname === "/types");

  const hrefByTabTitle = {
    "Entity Types": `${pathPrefix}entity-type`,
    "Link Types": `${pathPrefix}link-type`,
    "Property Types": `${pathPrefix}property-type`,
    "Data Types": `${pathPrefix}data-type`,
  };

  // The tabs are plain links — the type count lives in the table header.
  for (const [tabTitle, href] of Object.entries(hrefByTabTitle)) {
    await expect(page.locator(`[href*="${href}"]`)).toHaveText(tabTitle);
  }

  // The count is scoped to the user's webs by default, which may hold no
  // types. Deselecting every web empties the table. The empty state then reads
  // "No types yet" or "No types match your filters", depending on whether the
  // user owns any types, and both offer to show all public types. That brings
  // the system types in, so a non-zero count proves types actually loaded.
  await page.getByRole("button", { name: /^Web is/ }).click();
  const ownWebItems = page
    .getByRole("menuitem")
    .filter({ hasNotText: "Public in any web" });
  for (const ownWebItem of await ownWebItems.all()) {
    await ownWebItem.click();
  }
  await page.keyboard.press("Escape");

  const showAllPublicTypesButton = page.getByRole("button", {
    name: "Show all public types",
  });
  await expect(showAllPublicTypesButton).toBeVisible({ timeout: 15_000 });
  await showAllPublicTypesButton.click();

  await expect(page.getByText(/^[1-9][\d,]* types$/)).toBeVisible({
    timeout: 15_000,
  });

  // Each kind's tab renders a count of its own.
  for (const tabTitle of Object.keys(hrefByTabTitle)) {
    await page.getByRole("tab", { name: tabTitle }).click();
    await expect(page.getByText(/^[\d,]+ types?$/)).toBeVisible();
  }
});
