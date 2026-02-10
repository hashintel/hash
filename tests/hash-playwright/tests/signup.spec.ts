import { getKratosVerificationCode } from "./shared/get-kratos-verification-code";
import { resetDb } from "./shared/reset-db";
import { expect, type Page, test } from "./shared/runtime";

test.beforeEach(async () => {
  await resetDb();
});

const allowlistedEmail = "charlie@example.com";
const password = "some-complex-pw-1ab2";

const registerUser = async (page: Page, { email }: { email: string }) => {
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

  return { email, emailDispatchTimestamp };
};

const verifyEmail = async ({
  page,
  email,
  emailDispatchTimestamp,
}: {
  page: Page;
  email: string;
  emailDispatchTimestamp: number;
}) => {
  const verificationCode = await getKratosVerificationCode(
    email,
    emailDispatchTimestamp,
  );

  await page.fill(
    '[placeholder="Enter your verification code"]',
    verificationCode,
  );
  await page.getByRole("button", { name: "Verify" }).click();
};

test("allowlisted user can verify email and complete signup", async ({
  page,
}) => {
  const { email, emailDispatchTimestamp } = await registerUser(page, {
    email: allowlistedEmail,
  });

  await expect(page.locator("text=Verify your email address")).toBeVisible({
    timeout: 15_000,
  });

  await page.fill('[placeholder="Enter your verification code"]', "000000");
  await page.getByRole("button", { name: "Verify" }).click();

  await expect(
    page.locator(
      "text=/verification code.*(invalid|expired|used)|code is invalid|code is expired/i",
    ),
  ).toBeVisible();
  await expect(page.locator("text=Verify your email address")).toBeVisible();

  const resendTimestamp = Date.now();
  await page.getByRole("button", { name: "Resend verification email" }).click();

  await verifyEmail({
    page,
    email,
    emailDispatchTimestamp: Math.max(emailDispatchTimestamp, resendTimestamp),
  });

  await expect(
    page.locator("text=Thanks for confirming your account"),
  ).toBeVisible();

  const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1_000)}`;
  const shortname = `signup${uniqueSuffix}`.slice(0, 24);

  await page.fill('[placeholder="example"]', shortname);

  await page.fill('[placeholder="Jonathan Smith"]', "New User");

  await page.getByRole("button", { name: "Continue" }).click();

  await page.waitForURL("/");

  await expect(page.locator("text=Get support")).toBeVisible();
});

test("waitlisted user is redirected to waitlist after signup", async ({
  page,
}) => {
  const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1_000)}`;
  const waitlistedEmail = `signup-${uniqueSuffix}@example.com`;

  await registerUser(page, { email: waitlistedEmail });

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
