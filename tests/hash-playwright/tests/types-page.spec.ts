import { frontendUrl } from "@local/hash-isomorphic-utils/environment";

import { loginUsingTempForm } from "./shared/login-using-temp-form";
import { expect, test } from "./shared/runtime";

const pathPrefix = `${frontendUrl}/types/`;

test("/types page renders and loads types", async ({ page }) => {
  await loginUsingTempForm({
    page,
    userEmail: "alice@example.com",
    userPassword: "password",
  });

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
   */
  for (const [tabTitle, href] of Object.entries(hrefByTabTitle)) {
    await expect(page.locator(`[href*="${href}"]`)).toHaveText(
      new RegExp(`^${tabTitle}[1-9]\\d*$`),
    );
  }
});
