import { sleep } from "@local/hash-isomorphic-utils/sleep";
// eslint-disable-next-line no-restricted-imports
import type { Page } from "@playwright/test";

import { expect, test } from "./browser-plugin/fixtures";
import { loginUsingTempForm } from "./shared/login-using-temp-form";
import { resetDb } from "./shared/reset-db";

test.beforeEach(async () => {
  await resetDb();
});

const loggedOutHeaderLocator = "text=Connect to HASH";
const createAccountButtonLocator = "text=Create a free account";
const entityTypeSelectorLocator = '[placeholder="Search for types..."]';
const quickNoteInputLocator = '[placeholder="Start typing here..."]';

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

test("popup window loads with logged-out state", async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(page.locator(loggedOutHeaderLocator)).toBeVisible();

  await expect(page.locator(createAccountButtonLocator)).toBeVisible();
});

test("popup window loads with logged-in state", async ({
  page,
  extensionId,
}) => {
  await loginUsingTempForm({ page });

  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(page.locator("text=One-off")).toBeVisible();
});

test("options page loads with logged-out state", async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  await expect(page.locator(loggedOutHeaderLocator)).toBeVisible();

  await expect(page.locator(createAccountButtonLocator)).toBeVisible();
});

test("options page loads with logged-in state", async ({
  page,
  extensionId,
}) => {
  await loginUsingTempForm({ page });

  await page.goto(`chrome-extension://${extensionId}/options.html`);

  await expect(page.locator("text=Welcome, Alice")).toBeVisible();
});

test("user can type a quick note which persists across logouts", async ({
  page,
  extensionId,
}) => {
  // Sign in to HASH
  await loginUsingTempForm({ page });

  // Open the popup and start writing a quick note
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.click("text=One-off");
  const testQuickNote = "Hello, world! Here's the start of a note...";
  await page.fill(quickNoteInputLocator, testQuickNote);
  await sleep(1_500); // Wait for settings to save

  await signOutAndReloadPopup({ extensionId, page });

  await expect(page.locator(quickNoteInputLocator)).toHaveValue(testQuickNote);
});

/**
 * @todo figure out how to check that the correct message is sent from the background script to the API via websocket
 *   - when user clicks the 'suggest entities' button
 * @see https://github.com/microsoft/playwright/issues/15684#issuecomment-1892644655
 */
test("user can configure a one-off inference, and the settings are persisted", async ({
  page,
  extensionId,
}) => {
  // Sign in to HASH
  await loginUsingTempForm({ page });

  /**
   * Go to the popup page and get a reference to the plugin's service worker
   * @see https://playwright.dev/docs/service-workers-experimental
   */
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.click("text=One-off");

  // Choose two entity types from the entity type selector
  await page.click(entityTypeSelectorLocator);
  await page.keyboard.type("actor");
  await sleep(500);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await sleep(500);
  await page.keyboard.type("document");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");

  await sleep(1_500); // Wait for settings to save

  await signOutAndReloadPopup({ extensionId, page });

  await expect(page.locator("text=Actor")).toBeVisible();
  await expect(page.locator("text=Document")).toBeVisible();
});

/**
 * @todo figure out how to check that the correct message is sent from the background script to the API via websocket
 *   - when user visits a page that should trigger automatic inference
 * @see https://github.com/microsoft/playwright/issues/15684#issuecomment-1892644655
 */
test("user can enable automatic inference, and the settings are persisted", async ({
  page,
  extensionId,
}) => {
  await loginUsingTempForm({ page });

  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  // Choose an entity type from the entity type selector
  await page.click("text=Automated");
  await page.click("text=Select type");
  await page.click(entityTypeSelectorLocator);
  await page.keyboard.type("actor");
  await sleep(500);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");

  await page.click("text=Disabled");

  await expect(page.locator("text=Enabled")).toBeVisible();

  await sleep(1_500); // Wait for settings to save

  await signOutAndReloadPopup({ extensionId, page });

  await expect(page.locator("text=Enabled")).toBeVisible();
  await expect(page.locator("[value=Actor]")).toBeVisible();
});
