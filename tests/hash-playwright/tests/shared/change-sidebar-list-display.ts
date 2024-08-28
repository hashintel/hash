import { expect, type Page } from "@playwright/test";

/**
 * Changes the user's settings for how entities or types should be displayed in the sidebar.
 *
 * Only takes action if the desired display setting is different from the current one.
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

  await expect(page.getByText(switchLabel)).toBeVisible();

  const settingSwitch = page.getByLabel(switchLabel);

  if (
    (displayAs === "link" && (await settingSwitch.isChecked())) ||
    (displayAs === "list" && !(await settingSwitch.isChecked()))
  ) {
    await settingSwitch.check();
  }
};
