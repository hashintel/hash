import { getKratosVerificationCode } from "./shared/get-kratos-verification-code";
import { resetDb } from "./shared/reset-db";
import { expect, type Page, test } from "./shared/runtime";
import { generateTotpCode } from "./shared/totp-utils";

const createUserAndCompleteSignup = async (page: Page) => {
  const randomSuffix = `${Date.now()}${Math.floor(Math.random() * 1_000)}`;
  const email = `mfa-${randomSuffix}@example.com`;
  const password = "some-complex-pw-1ab2";
  const shortname = `mfa${randomSuffix}`.slice(0, 24);

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

  await expect(page.locator("text=Verify your email address")).toBeVisible({
    timeout: 15_000,
  });

  const verificationCode = await getKratosVerificationCode(
    email,
    emailDispatchTimestamp,
  );

  await page.fill(
    '[placeholder="Enter your verification code"]',
    verificationCode,
  );
  await page.getByRole("button", { name: "Verify" }).click();

  await expect(
    page.locator("text=Thanks for confirming your account"),
  ).toBeVisible();

  await page.fill('[placeholder="example"]', shortname);
  await page.fill('[placeholder="Jonathan Smith"]', "MFA User");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.waitForURL("/");
  await expect(page.locator("text=Get support")).toBeVisible();

  return { email, password };
};

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

const signInWithPassword = async (
  page: Page,
  { email, password }: { email: string; password: string },
) => {
  await page.goto("/signin");
  await page.fill('[placeholder="Enter your email address"]', email);
  await page.fill('[placeholder="Enter your password"]', password);
  await page.click("text=Submit");
};

test.beforeEach(async () => {
  await resetDb();
});

test("user can enable TOTP", async ({ page }) => {
  await createUserAndCompleteSignup(page);

  const { backupCodes } = await enableTotpForCurrentUser(page);

  expect(backupCodes.length).toBeGreaterThan(0);
});

test("user with TOTP is prompted for code at login", async ({ page }) => {
  const credentials = await createUserAndCompleteSignup(page);
  const { secret } = await enableTotpForCurrentUser(page);

  await page.context().clearCookies();

  await signInWithPassword(page, credentials);

  await expect(
    page.locator("text=Enter your authentication code"),
  ).toBeVisible();

  await page.fill(
    '[data-testid="signin-aal2-code-input"]',
    generateTotpCode(secret),
  );
  await page.click('[data-testid="signin-aal2-submit-button"]');

  await expect(page.locator("text=Get support")).toBeVisible();
});

test("user can use backup code instead of TOTP", async ({ page }) => {
  const credentials = await createUserAndCompleteSignup(page);
  const { backupCodes } = await enableTotpForCurrentUser(page);

  expect(backupCodes.length).toBeGreaterThan(0);

  await page.context().clearCookies();

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
  const credentials = await createUserAndCompleteSignup(page);
  const { secret } = await enableTotpForCurrentUser(page);

  await page.goto("/settings/security");
  await page.click('[data-testid="disable-totp-button"]');
  await page.fill(
    '[placeholder="Enter a current code to disable"]',
    generateTotpCode(secret),
  );
  await page.click('[data-testid="confirm-disable-totp-button"]');

  await expect(
    page.locator('[data-testid="show-enable-totp-form-button"]'),
  ).toBeVisible();

  await page.context().clearCookies();

  await signInWithPassword(page, credentials);

  await expect(page.locator("text=Get support")).toBeVisible();
  await expect(
    page.locator("text=Enter your authentication code"),
  ).not.toBeVisible();
});

test("wrong TOTP code shows error at login", async ({ page }) => {
  const credentials = await createUserAndCompleteSignup(page);
  await enableTotpForCurrentUser(page);

  await page.context().clearCookies();

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
