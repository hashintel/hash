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
  await page.goto("/types");

  for (const tabTitle of [
    "Entity Types",
    "Link Types",
    "Property Types",
    "Data Types",
  ]) {
    await expect(
      page.getByRole("tab", { name: new RegExp(`^${tabTitle}\\s*[1-9]\\d*$`) }),
    ).toBeVisible();
  }

  const createButtonByTabTitle = {
    All: { label: "Create type", href: "/new/types/entity-type" },
    "Entity Types": {
      label: "Create entity type",
      href: "/new/types/entity-type",
    },
    "Link Types": {
      label: "Create link type",
      href: "/new/types/entity-type?extends=https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1",
    },
    "Property Types": null,
    "Data Types": {
      label: "Create data type",
      href: "/new/types/data-type",
    },
  };

  for (const [tabTitle, createButton] of Object.entries(
    createButtonByTabTitle,
  )) {
    await page.getByRole("tab", { name: new RegExp(`^${tabTitle}`) }).click();

    await expect(
      page.getByRole("tab", {
        name: new RegExp(`^${tabTitle}`),
        selected: true,
      }),
    ).toBeVisible();

    if (createButton) {
      await expect(
        page.getByRole("link", { name: createButton.label, exact: true }),
      ).toHaveAttribute("href", `${frontendUrl}${createButton.href}`);
    } else {
      await expect(
        page.getByRole("link", { name: /^Create( \w+)? type$/ }),
      ).toHaveCount(0);
    }
  }
});
