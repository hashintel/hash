import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { deleteUserByEmail } from "./delete-user";
import { getKratosVerificationCode } from "./get-kratos-verification-code";

/**
 * `deleteUserByEmail` intentionally preserves the user's web principal so
 * entity types created under it remain valid for other webs that reference
 * them. The orphan principal holds onto the old shortname, so re-runs must
 * pick a fresh one to avoid a "shortname already taken" error.
 */
const uniqueShortname = (base: string): string => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1_000)}`;
  const maxBaseLength = 24 - suffix.length;
  return `${base.slice(0, maxBaseLength)}${suffix}`;
};

/**
 * Fill in the signup form and submit it.
 * Returns the email and the timestamp just before submission (for email polling).
 */
export const registerUser = async (
  page: Page,
  { email, password }: { email: string; password: string },
) => {
  await page.goto("/signup", { waitUntil: "networkidle" });

  await expect(page).toHaveURL(/\/signup/, { timeout: 5_000 });

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
 * Full signup flow: register, verify email, and complete the account page.
 *
 * Deletes any Kratos identity left over from a previous run before
 * registering, and randomises the shortname via {@link uniqueShortname}.
 */
export const createUserAndCompleteSignup = async (
  page: Page,
  {
    email,
    shortname,
    displayName,
    password,
  }: {
    email: string;
    shortname: string;
    displayName?: string;
    password: string;
  },
) => {
  await deleteUserByEmail(email);

  const runShortname = uniqueShortname(shortname);

  const { emailDispatchTimestamp } = await registerUser(page, {
    email,
    password,
  });

  await verifyEmailOnPage(page, {
    email,
    afterTimestamp: emailDispatchTimestamp,
  });

  await completeSignup(page, {
    shortname: runShortname,
    displayName: displayName ?? runShortname,
  });

  return { email, password };
};
