import { expect, test } from "../shared/runtime";
import {
  clearSessionCookies,
  expectSignedIn,
  expectSignedOut,
  signInWithPassword,
} from "../shared/signin-utils";
import { createUserAndCompleteSignup } from "../shared/signup-utils";
import { testUsers } from "../shared/test-users";

test("user can sign in with password", async ({ page }) => {
  const credentials = await createUserAndCompleteSignup(
    page,
    testUsers.signinTest,
  );

  await clearSessionCookies(page);
  await expectSignedOut(page);

  await signInWithPassword(page, credentials);
  await expectSignedIn(page);
});

test("user can sign out via account menu", async ({ page }) => {
  await createUserAndCompleteSignup(page, testUsers.signoutTest);

  // Use the real sign-out flow (not clearCookies)
  await page.getByTestId("user-avatar").click();
  await page.getByText("Sign Out").click();

  await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible({
    timeout: 5_000,
  });
});
