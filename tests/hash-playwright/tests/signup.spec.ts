import { getKratosVerificationCode } from "./shared/get-kratos-verification-code";
import { resetDb } from "./shared/reset-db";
import { expect, test } from "./shared/runtime";
import {
  completeSignup,
  registerUser,
  verifyEmailOnPage,
} from "./shared/signup-utils";

test.beforeEach(async () => {
  await resetDb();
});

const allowlistedEmail = "charlie@example.com";

test("allowlisted user can verify email and complete signup", async ({
  page,
}) => {
  const { email, emailDispatchTimestamp } = await registerUser(page, {
    email: allowlistedEmail,
  });

  await expect(
    page.getByRole("heading", { name: "Verify your email address" }),
  ).toBeVisible({ timeout: 15_000 });

  // Submitting an incorrect code should show an error
  await page.fill('[placeholder="Enter your verification code"]', "000000");
  await page.getByRole("button", { name: "Verify" }).click();

  await expect(
    page.locator(
      "text=/verification code.*(invalid|expired|used)|code is invalid|code is expired/i",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Verify your email address" }),
  ).toBeVisible();

  // Resend the verification email and verify with the correct code
  const resendTimestamp = Date.now();
  await page.getByRole("button", { name: "Resend verification email" }).click();

  const verificationCode = await getKratosVerificationCode(
    email,
    Math.max(emailDispatchTimestamp, resendTimestamp),
  );

  await page.fill(
    '[placeholder="Enter your verification code"]',
    verificationCode,
  );
  await page.getByRole("button", { name: "Verify" }).click();

  // Complete signup after verification
  const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1_000)}`;
  const shortname = `signup${uniqueSuffix}`.slice(0, 24);

  await completeSignup(page, { shortname, displayName: "New User" });
});

test("waitlisted user is redirected to waitlist after signup", async ({
  page,
}) => {
  const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1_000)}`;
  const waitlistedEmail = `signup-${uniqueSuffix}@example.com`;

  const { emailDispatchTimestamp } = await registerUser(page, {
    email: waitlistedEmail,
  });

  // Waitlisted users must also verify their email before proceeding
  await verifyEmailOnPage(page, {
    email: waitlistedEmail,
    afterTimestamp: emailDispatchTimestamp,
  });

  await page.waitForURL("/");
  await expect(
    page.getByRole("heading", { name: "on the waitlist", exact: false }),
  ).toBeVisible();

  await page.goto("/settings/security");
  await page.waitForURL("/");
  await expect(
    page.getByRole("heading", { name: "on the waitlist", exact: false }),
  ).toBeVisible();

  await page.goto("/signup");
  await page.waitForURL("/");

  await expect(
    page.getByRole("heading", { name: "on the waitlist", exact: false }),
  ).toBeVisible();
});
