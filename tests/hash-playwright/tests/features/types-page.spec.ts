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

  // Check that all tabs have a non-zero type count
  for (const [tabTitle, href] of Object.entries(hrefByTabTitle)) {
    await expect(page.locator(`[href*="${href}"]`)).toHaveText(
      new RegExp(`^${tabTitle}[1-9]\\d*$`),
    );
  }
});

test("/types create button matches the selected tab", async ({ page }) => {
  const createButtonByPath = {
    "/types": { label: "Create type", href: "/new/types/entity-type" },
    "/types/entity-type": {
      label: "Create entity type",
      href: "/new/types/entity-type",
    },
    "/types/link-type": {
      label: "Create link type",
      href: "/new/types/entity-type?extends=https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1",
    },
    "/types/data-type": {
      label: "Create data type",
      href: "/new/types/data-type",
    },
  };

  for (const [path, { label, href }] of Object.entries(createButtonByPath)) {
    await page.goto(path);

    await expect(
      page.getByRole("link", { name: label, exact: true }),
    ).toHaveAttribute("href", `${frontendUrl}${href}`);
  }

  await page.goto("/types/property-type");

  await expect(
    page.getByRole("tab", { name: /^Property Types/, selected: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /^Create( \w+)? type$/ }),
  ).toHaveCount(0);
});
