import { expect, type Page } from "@playwright/test";

/**
 * Changes the user's settings for how entities or types should be
 * displayed in the sidebar, and waits for the sidebar to reflect the
 * change. In list mode the section appears as an uppercase expandable
 * header ("ENTITIES >"); in link mode it appears as a regular nav link.
 */
export const changeSidebarListDisplay = async ({
  displayAs,
  page,
  section,
}: {
  displayAs: "list" | "link";
  page: Page;
  section: "Entities" | "Types";
}) => {
  await page.getByTestId("user-avatar").click();
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: "Personalization" }).click();

  const switchLabel = `${section} as a`;

  await expect(page.getByLabel(switchLabel)).toBeVisible();

  if (
    (displayAs === "link" &&
      (await page.getByLabel(switchLabel).isChecked())) ||
    (displayAs === "list" && !(await page.getByLabel(switchLabel).isChecked()))
  ) {
    await page.getByLabel(switchLabel).check();
  }

  // The sidebar updates asynchronously after the toggle. In list mode
  // the section renders as an uppercase expandable header (e.g.
  // "ENTITIES >"); in link mode it renders as a plain nav link.
  const sectionUpper = section.toUpperCase();
  if (displayAs === "list") {
    await expect(page.locator(`text=${sectionUpper}`)).toBeVisible();
  } else {
    await expect(page.locator(`text=${sectionUpper}`)).toBeHidden();
  }
};
