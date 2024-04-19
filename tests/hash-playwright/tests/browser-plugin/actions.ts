import { sleep } from "@local/hash-isomorphic-utils/sleep";
import { Page } from "@playwright/test";

import { loginUsingTempForm } from "../shared/login-using-temp-form";
import { expect } from "./fixtures";

export const entityTypeSelectorLocator = '[placeholder="Search for types..."]';

export const loggedOutHeaderLocator = "text=Connect to HASH";

export const signOutAndReloadPopup = async ({
  extensionId,
  page,
}: {
  extensionId: string;
  page: Page;
}) => {
  // Sign out from HASH
  await page.goto("/");
  await page.click(`[data-testid="user-avatar"]`);
  await page.click("text=Sign Out");
  await sleep(1_000);

  // Confirm the popup has been signed out
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.locator(loggedOutHeaderLocator)).toBeVisible();

  // Sign back in again and confirm the tabs are visible again
  await loginUsingTempForm({ page });
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.locator("text=One-off")).toBeVisible();
};
