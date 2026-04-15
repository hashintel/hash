import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export const signInWithPassword = async (
  page: Page,
  { email, password }: { email: string; password: string },
) => {
  await page.goto("/signin");
  await page.fill('[placeholder="Enter your email address"]', email);
  await page.fill('[placeholder="Enter your password"]', password);
  await page.click("text=Submit");
};

/**
 * Drop the user's session cookies. Does not exercise the Kratos logout
 * flow — for that, see the dedicated sign-out test.
 */
export const signOut = async (page: Page) => {
  await page.context().clearCookies();
};

export const expectSignedIn = async (page: Page) => {
  await expect(page.locator("text=Get support")).toBeVisible();
};

export const expectSignedOut = async (page: Page) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible();
};
