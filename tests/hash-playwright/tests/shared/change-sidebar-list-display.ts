import { expect, type Page } from "@playwright/test";

/**
 * Changes the user's settings for how entities or types should be
 * displayed in the sidebar, and waits for the sidebar to reflect the
 * change. In list mode the section appears as an expandable header
 * (non-link); in link mode it appears as a regular nav link.
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

  // The sidebar updates asynchronously after the toggle. Scope
  // assertions to the sidebar to avoid matching settings-page content
  // (e.g. the "Entities as a" label on the personalization page).
  const sidebar = page.getByTestId("page-sidebar");
  if (displayAs === "list") {
    // In list mode the section renders as a non-link expandable header.
    await expect(sidebar.getByText(section, { exact: true })).toBeVisible();
  } else {
    // In link mode the section renders as a plain nav link.
    await expect(sidebar.getByRole("link", { name: section })).toBeVisible();
  }
};
