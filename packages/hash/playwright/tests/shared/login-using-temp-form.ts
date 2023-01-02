import { expect } from "@playwright/test";
import { Page } from "playwright";

/**
 * @todo Remove this function in favor of `loginUsingUi`once we have a proper login flow
 */
export const loginUsingTempForm = async ({
  page,
  userEmail = "alice@example.com",
  userPassword = "password",
}: {
  page: Page;
  userEmail?: string;
  userPassword?: string;
}): Promise<void> => {
  await page.goto("/login");

  const emailInputSelector = '[placeholder="Enter your email address"]';

  await page.fill(emailInputSelector, userEmail);

  await page.press(emailInputSelector, "Enter");

  const passwordInputSelector = '[type="password"]';
  await page.fill(passwordInputSelector, userPassword);
  await page.press(passwordInputSelector, "Enter");

  // Wait for the redirect to the account page
  await expect(page.locator("text=Welcome to HASH")).toBeVisible();

  // Wait for user avatar to appear
  await expect(page.locator(`[data-testid="user-avatar"]`)).toBeVisible();
};
