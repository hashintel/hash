import type { Page } from "@playwright/test";

/** Load the app through the normal UI and show the AI panel; nothing is sent. */
export const showPersonaPanel = async (
  page: Page,
  origin: string,
  route = "/",
) => {
  await page.goto(new URL(route, origin).href);
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  await skipTour.waitFor();
  await skipTour.click();
  await page
    .getByRole("button", { name: "Show AI assistant", exact: true })
    .click();
};
