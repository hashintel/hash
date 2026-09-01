import { getKratosRecoveryCode } from "../shared/get-kratos-verification-code";
import { expect, test } from "../shared/runtime";
import {
  clearSessionCookies,
  expectSignedIn,
  signInWithPassword,
} from "../shared/signin-utils";
import { createUserAndCompleteSignup } from "../shared/signup-utils";
import { testUsers } from "../shared/test-users";

test("user can change password from settings", async ({ page }) => {
  const newPassword = "changed-pw-5ef6";
  const credentials = await createUserAndCompleteSignup(
    page,
    testUsers.pwChange,
  );

  await page.goto("/settings/security", { waitUntil: "networkidle" });

  await page.fill('[placeholder="Enter your new password"]', newPassword);
  await page.click("text=Update password");

  await expect(page.locator("text=Your changes have been saved")).toBeVisible({
    timeout: 5_000,
  });

  await clearSessionCookies(page);
  await signInWithPassword(page, {
    email: credentials.email,
    password: newPassword,
  });
  await expectSignedIn(page);
});

test("user can recover account and set a new password", async ({ page }) => {
  const newPassword = "recovered-pw-3cd4";
  const credentials = await createUserAndCompleteSignup(
    page,
    testUsers.pwRecovery,
  );

  await clearSessionCookies(page);

  // Start recovery flow
  const recoveryFlowReady = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.url().includes("/auth/self-service/recovery/browser"),
    { timeout: 10_000 },
  );

  await page.goto("/recovery");
  await recoveryFlowReady;

  const recoveryTimestamp = Date.now();

  await page.fill(
    '[placeholder="Enter your email address"]',
    credentials.email,
  );

  const recoverySubmitComplete = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/auth/self-service/recovery"),
    { timeout: 10_000 },
  );

  await page.click("text=Recover account");
  await recoverySubmitComplete;

  await expect(
    page.locator('[placeholder="Enter your verification code"]'),
  ).toBeVisible({ timeout: 5_000 });

  const recoveryCode = await getKratosRecoveryCode(
    credentials.email,
    recoveryTimestamp,
  );

  // Kratos redirects to settings/security after successful recovery, and the
  // page then fetches the settings flow from Kratos. Wait for that fetch
  // before interacting — without it, the submit handler silently returns
  // because `flow` is still undefined in component state.
  const settingsFlowReady = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.url().includes("/auth/self-service/settings/flows"),
    { timeout: 10_000 },
  );

  await page.fill('[placeholder="Enter your verification code"]', recoveryCode);

  await page.waitForURL("**/settings/security**", { timeout: 5_000 });
  await settingsFlowReady;

  // Recovery session is privileged — password change must work without re-auth
  await page.fill('[placeholder="Enter your new password"]', newPassword);
  await page.click("text=Update password");

  await expect(page.locator("text=Your changes have been saved")).toBeVisible({
    timeout: 5_000,
  });

  await clearSessionCookies(page);
  await signInWithPassword(page, {
    email: credentials.email,
    password: newPassword,
  });
  await expectSignedIn(page);
});

test("recovery page tells an already signed-in user to log out", async ({
  page,
}) => {
  const credentials = await createUserAndCompleteSignup(
    page,
    testUsers.pwRecoverySignedIn,
  );

  await page.goto("/recovery");

  await expect(
    page.getByRole("heading", { name: "Account Recovery" }),
  ).toBeVisible({ timeout: 10_000 });

  // A single element holding both lines means the break between them collapsed.
  await expect(
    page.getByRole("paragraph").filter({ hasText: "You are logged in as" }),
  ).toHaveText(`You are logged in as ${credentials.email}`, {
    timeout: 10_000,
  });

  await expect(
    page
      .getByRole("paragraph")
      .filter({ hasText: "recover a different account" }),
  ).toHaveText(
    "If you want to recover a different account, please log out first",
  );

  await expect(
    page.getByRole("button", { name: "Recover account" }),
  ).toBeHidden();

  await page.getByRole("link", { name: "Go home" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expectSignedIn(page);
});
