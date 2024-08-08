import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { getDerivedPayloadFromMostRecentEmail } from "./get-derived-payload-from-most-recent-email";

export const loginUsingUi = async ({
  page,
  accountShortName,
}: {
  page: Page;
  accountShortName: string;
}): Promise<void> => {
  await page.goto("/signin");

  // Enter account short name
  const accountShortNameInputSelector =
    '[placeholder="Enter your email or shortname"]';

  await page.fill(accountShortNameInputSelector, accountShortName);

  const emailDispatchTimestamp = Date.now();
  await page.press(accountShortNameInputSelector, "Enter");

  await expect(
    page.locator(
      "text=/User with id .* has created too many verification codes recently/",
    ),
  ).not.toBeVisible();

  // Enter verification code
  const verificationCodeInputSelector = '[data-testid="verify-code-input"]';
  await page.fill(
    verificationCodeInputSelector,
    (await getDerivedPayloadFromMostRecentEmail(emailDispatchTimestamp))
      .verificationCode as string,
  );
  await page.press(verificationCodeInputSelector, "Enter");

  // Wait for the redirect to the account page
  await expect(page.locator("text=Get support")).toBeVisible();

  // Wait for Sign in button to disappear
  // TODO: Completely avoid rendering "Sign up" / "Sign in" after successful sign in
  await expect(page.locator('button:has-text("Sign in")')).not.toBeVisible();
  await expect(page.locator(`[data-testid="user-avatar"]`)).toBeVisible();
};
