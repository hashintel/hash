import { deleteUserByEmail } from "../shared/delete-user";
import { expect, test } from "../shared/runtime";
import {
  completeSignup,
  registerUser,
  verifyEmailOnPage,
} from "../shared/signup-utils";
import { defaultPassword, testUsers } from "../shared/test-users";

test("allowlisted user can verify email and complete signup", async ({
  page,
}) => {
  const { email } = testUsers.signupAllowlisted;
  await deleteUserByEmail(email);

  const { emailDispatchTimestamp } = await registerUser(page, {
    email,
    password: defaultPassword,
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
    password: defaultPassword,
  });

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
