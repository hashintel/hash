import { expect, type Page, test } from "../shared/runtime";
import {
  clearSessionCookies,
  signInWithPassword,
} from "../shared/signin-utils";
import { createUserAndCompleteSignup } from "../shared/signup-utils";
import { testUsers } from "../shared/test-users";
import { generateTotpCode, waitForFreshTotpWindow } from "../shared/totp-utils";

const enableTotpForCurrentUser = async (page: Page) => {
  await page.goto("/settings/security");
  await page.click('[data-testid="show-enable-totp-form-button"]');

  const secretKeyLocator = page.locator('[data-testid="totp-secret-key"]');
  await expect(secretKeyLocator).toBeVisible();

  const secret =
    (await secretKeyLocator.textContent())?.replace(/\s/g, "") ?? "";
  if (!secret) {
    throw new Error("Could not read TOTP secret key from settings page.");
  }

  await waitForFreshTotpWindow();
  await page.fill(
    '[placeholder="Enter your 6-digit code"]',
    generateTotpCode(secret),
  );
  await page.click('[data-testid="enable-totp-button"]');

  const backupCodesModal = page.locator('[data-testid="backup-codes-modal"]');
  await expect(backupCodesModal).toBeVisible();

  const backupCodes = (
    await page.locator('[data-testid="backup-code-item"]').allTextContents()
  )
    .map((code) => code.trim())
    .filter((code) => code.length > 0);

  await page.click('[data-testid="confirm-backup-codes-button"]');
  await expect(backupCodesModal).not.toBeVisible();

  await expect(
    page.locator('[data-testid="disable-totp-button"]'),
  ).toBeVisible();

  return { backupCodes, secret };
};

test("user can enable TOTP", async ({ page }) => {
  await createUserAndCompleteSignup(page, testUsers.mfaEnable);

  const { backupCodes } = await enableTotpForCurrentUser(page);

  expect(backupCodes.length).toBeGreaterThan(0);
});

test("user with TOTP is prompted for code at login", async ({ page }) => {
  const credentials = await createUserAndCompleteSignup(
    page,
    testUsers.mfaLogin,
  );
  const { secret } = await enableTotpForCurrentUser(page);

  await clearSessionCookies(page);

  await signInWithPassword(page, credentials);

  await expect(
    page.locator("text=Enter your authentication code"),
  ).toBeVisible();

  await waitForFreshTotpWindow();
  await page.fill(
    '[data-testid="signin-aal2-code-input"]',
    generateTotpCode(secret),
  );
  await page.click('[data-testid="signin-aal2-submit-button"]');

  await expect(page.locator("text=Get support")).toBeVisible();
});

test("user can use backup code instead of TOTP", async ({ page }) => {
  const credentials = await createUserAndCompleteSignup(
    page,
    testUsers.mfaBackup,
  );
  const { backupCodes } = await enableTotpForCurrentUser(page);

  expect(backupCodes.length).toBeGreaterThan(0);

  await clearSessionCookies(page);

  await signInWithPassword(page, credentials);
  await expect(
    page.locator("text=Enter your authentication code"),
  ).toBeVisible();

  await page.click('[data-testid="signin-aal2-toggle-method-button"]');
  await page.fill('[data-testid="signin-aal2-code-input"]', backupCodes[0]!);
  await page.click('[data-testid="signin-aal2-submit-button"]');

  await expect(page.locator("text=Get support")).toBeVisible();
});

test("user can disable TOTP", async ({ page }) => {
  const credentials = await createUserAndCompleteSignup(
    page,
    testUsers.mfaDisable,
  );
  await enableTotpForCurrentUser(page);

  await page.goto("/settings/security");
  await page.click('[data-testid="disable-totp-button"]');
  await page.click('[data-testid="confirm-disable-totp-button"]');

  await expect(
    page.locator('[data-testid="show-enable-totp-form-button"]'),
  ).toBeVisible();

  // Backup codes should also be cleared as part of the disable flow.
  await page.reload();
  await expect(
    page.locator('[data-testid="show-enable-totp-form-button"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-testid="regenerate-backup-codes-button"]'),
  ).not.toBeVisible();

  await clearSessionCookies(page);

  await signInWithPassword(page, credentials);

  await expect(page.locator("text=Get support")).toBeVisible();
  await expect(
    page.locator("text=Enter your authentication code"),
  ).not.toBeVisible();
});

test("wrong TOTP code shows error at login", async ({ page }) => {
  const credentials = await createUserAndCompleteSignup(
    page,
    testUsers.mfaWrongCode,
  );
  await enableTotpForCurrentUser(page);

  await clearSessionCookies(page);

  await signInWithPassword(page, credentials);
  await expect(
    page.locator("text=Enter your authentication code"),
  ).toBeVisible();

  await page.fill('[data-testid="signin-aal2-code-input"]', "000000");
  await page.click('[data-testid="signin-aal2-submit-button"]');

  await expect(page.locator("text=/invalid|expired|used/i")).toBeVisible();
  await expect(
    page.locator("text=Enter your authentication code"),
  ).toBeVisible();
});
