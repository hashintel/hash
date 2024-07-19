import { sleep } from "@local/hash-isomorphic-utils/sleep";
// eslint-disable-next-line no-restricted-imports
import { test as testTolerateConsoleErrors } from "@playwright/test";

import { loginUsingTempForm } from "./shared/login-using-temp-form";
import { resetDb } from "./shared/reset-db";
import { expect } from "./shared/runtime";

testTolerateConsoleErrors.beforeEach(async () => {
  await resetDb();
});

const blockCollectionMountTimeout = 5_000;

/**
 * @todo H-2006 fix bugs on profile page and revert to using 'test' from ./shared/runtime
 * @todo H-3126 update entity store in FE to handle immutable entities
 */
testTolerateConsoleErrors.skip(
  "a user's profile page renders",
  async ({ page }) => {
    await loginUsingTempForm({
      page,
      userEmail: "alice@example.com",
      userPassword: "password",
    });

    await page.goto("/@alice");

    await expect(page.locator("text=@alice")).toBeVisible();
    await expect(page.locator('text="Profile"')).toBeVisible();

    await page.click("text=Add a bio for Alice...");

    await sleep(blockCollectionMountTimeout);

    const bioText = "Alice's bio";

    await page.keyboard.type(bioText);

    await page.click("[aria-label='Save Bio']");

    await sleep(2_000);

    await page.reload();

    await sleep(2_000);

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
    await loginUsingTempForm({
      page,
      userEmail: "alice@example.com",
      userPassword: "password",
    });

    await page.goto("/@example-org");

    await expect(page.locator("text=@example-org")).toBeVisible();
    await expect(page.locator('text="Profile"')).toBeVisible();

    await page.click("text=Add a bio for Example...");

    await sleep(blockCollectionMountTimeout);

    const bioText = "Example Org's bio";
    await page.keyboard.type(bioText);

    await page.click("[aria-label='Save Bio']");

    await sleep(2_000);

    await page.reload();

    await sleep(2_000);

    await expect(page.locator("text=@example-org")).toBeVisible();
    await expect(page.locator(`text=${bioText}`)).toBeVisible();
  },
);
