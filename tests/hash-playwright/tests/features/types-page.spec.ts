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

  /**
   * Check that all tabs have a non-zero type count.
   *
   * The counts render only once the types contexts have finished loading all
   * types (a heavy all-versions query) – until then the tabs show just their
   * title alongside a loading spinner, so allow a generous timeout rather
   * than the default 5s.
   */
  for (const [tabTitle, href] of Object.entries(hrefByTabTitle)) {
    await expect(page.locator(`[href*="${href}"]`)).toHaveText(
      new RegExp(`^${tabTitle}[1-9]\\d*$`),
      { timeout: 30_000 },
    );
  }
});
