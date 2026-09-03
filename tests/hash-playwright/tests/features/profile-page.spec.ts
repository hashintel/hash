// eslint-disable-next-line no-restricted-imports
import { test as testTolerateConsoleErrors } from "@playwright/test";

import { expect } from "../shared/runtime";

import type { Page } from "../shared/runtime";

testTolerateConsoleErrors.beforeEach(async () => {});

const placeholderSelector =
  "text=Type / to browse blocks, or @ to browse entities";

const waitForBioSave = (page: Page, bioText: string) =>
  page.waitForResponse((response) => {
    const postData = response.request().postData() ?? "";

    return (
      response.url().includes("/graphql") &&
      postData.includes("updateBlockCollectionContents") &&
      postData.includes(bioText)
    );
  });

/**
 * @todo H-2006 fix bugs on profile page and revert to using 'test' from ./shared/runtime
 * @todo H-3126 update entity store in FE to handle immutable entities
 */
testTolerateConsoleErrors.skip(
  "a user's profile page renders",
  async ({ page }) => {
    await page.goto("/@alice");

    await expect(page.locator("text=@alice")).toBeVisible();
    await expect(page.locator('text="Profile"')).toBeVisible();

    await page.click("text=Add a bio for Alice...");

    await expect(page.locator(placeholderSelector)).toBeVisible();

    const bioText = "Alice's bio";
    const bioSaved = waitForBioSave(page, bioText);

    await page.keyboard.type(bioText);

    await page.click("[aria-label='Save Bio']");

    await bioSaved;

    await page.reload();

    await expect(page.locator("text=@alice")).toBeVisible();
    await expect(page.locator(`text=${bioText}`)).toBeVisible();
  },
);

/**
 * @todo H-2006 fix bugs on profile page and revert to using 'test' from ./shared/runtime
 * @todo H-3126 update entity store in FE to handle immutable entities
 */
testTolerateConsoleErrors.skip(
  "an org's profile page renders, with and without a bio",
  async ({ page }) => {
    await page.goto("/@example-org");

    await expect(page.locator("text=@example-org")).toBeVisible();
    await expect(page.locator('text="Profile"')).toBeVisible();

    await page.click("text=Add a bio for Example...");

    await expect(page.locator(placeholderSelector)).toBeVisible();

    const bioText = "Example Org's bio";
    const bioSaved = waitForBioSave(page, bioText);

    await page.keyboard.type(bioText);

    await page.click("[aria-label='Save Bio']");

    await bioSaved;

    await page.reload();

    await expect(page.locator("text=@example-org")).toBeVisible();
    await expect(page.locator(`text=${bioText}`)).toBeVisible();
  },
);
