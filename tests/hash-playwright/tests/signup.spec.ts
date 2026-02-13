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

  await verifyEmailOnPage(page, {
    email,
    afterTimestamp: emailDispatchTimestamp,
  });

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
    page.getByText("on the waitlist", { exact: false }),
  ).toBeVisible();

  await page.goto("/settings/security");
  await page.waitForURL("/");
  await expect(
    page.getByText("on the waitlist", { exact: false }),
  ).toBeVisible();

  await page.goto("/signup");
  await page.waitForURL("/");

  await expect(
    page.getByText("on the waitlist", { exact: false }),
  ).toBeVisible();
});
