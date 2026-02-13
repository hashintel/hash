import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { getKratosVerificationCode } from "./get-kratos-verification-code";

const defaultPassword = "some-complex-pw-1ab2";

/**
 * Fill in the signup form and submit it.
 * Returns the email and the timestamp just before submission (for email polling).
 */
export const registerUser = async (
  page: Page,
  { email, password = defaultPassword }: { email: string; password?: string },
) => {
  const registrationFlowReady = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.url().includes("/auth/self-service/registration/browser"),
    { timeout: 15_000 },
  );

  await page.goto("/signup");
  await registrationFlowReady;

  await page.fill('[placeholder="Enter your email address"]', email);
  await page.fill('[type="password"]', password);

  const emailDispatchTimestamp = Date.now();
  const registrationSubmitComplete = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/auth/self-service/registration"),
    { timeout: 15_000 },
  );

  await page.getByRole("button", { name: "Sign up" }).click();
  await registrationSubmitComplete;

  return { email, emailDispatchTimestamp, password };
};

/**
 * On the verification screen, fetch the verification code from Mailslurper
 * and enter it into the form.
 */
export const verifyEmailOnPage = async (
  page: Page,
  { email, afterTimestamp }: { email: string; afterTimestamp: number },
) => {
  await expect(
    page.getByRole("heading", { name: "Verify your email address" }),
  ).toBeVisible({ timeout: 15_000 });

  const verificationCode = await getKratosVerificationCode(
    email,
    afterTimestamp,
  );

  await page.fill(
    '[placeholder="Enter your verification code"]',
    verificationCode,
  );
  await page.getByRole("button", { name: "Verify" }).click();
};

/**
 * Complete the signup form by entering a shortname and display name.
 * Expects to be on the account completion page (after email verification).
 */
export const completeSignup = async (
  page: Page,
  { shortname, displayName }: { shortname: string; displayName: string },
) => {
  await expect(
    page.locator("text=Thanks for confirming your account"),
  ).toBeVisible({ timeout: 15_000 });

  await page.fill('[placeholder="example"]', shortname);
  await page.fill('[placeholder="Jonathan Smith"]', displayName);
  await page.getByRole("button", { name: "Continue" }).click();

  await page.waitForURL("/");
  await expect(page.locator("text=Get support")).toBeVisible();
};

/**
 * Full flow: register a user, verify email, and complete signup.
 */
export const createUserAndCompleteSignup = async (
  page: Page,
  {
    email,
    shortname,
    displayName = shortname,
    password = defaultPassword,
  }: {
    email: string;
    shortname: string;
    displayName?: string;
    password?: string;
  },
) => {
  const { emailDispatchTimestamp } = await registerUser(page, {
    email,
    password,
  });

  await verifyEmailOnPage(page, {
    email,
    afterTimestamp: emailDispatchTimestamp,
  });

  await completeSignup(page, { shortname, displayName });

  return { email, password };
};
