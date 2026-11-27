import { expect, type Page } from "@playwright/test";

const waitForUpdateEntity = (page: Page) =>
  page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      res.url().includes("/graphql") &&
      res.request().postData()?.includes("updateEntity") === true,
  );

const sidebarSections = {
  Entities: { path: "/entities", settingLabel: "Show entity shortcuts" },
  Types: { path: "/types", settingLabel: "Show type shortcuts" },
} as const;

/**
 * Changes the user's setting for whether the sidebar lists shortcuts to
 * entities or types (`list`) or only links to them (`link`).
 *
 * The sidebar link itself is always shown. The shortcuts appear under it
 * while that section is open; see {@link expandSidebarSection}.
 *
 * Waits for the `updateEntity` PATCH to complete before returning, to avoid
 * concurrent-update errors on the user entity (see FE-600).
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

  const toggle = page.getByLabel(sidebarSections[section].settingLabel);
  await expect(toggle).toBeVisible();

  const alreadyCorrect =
    displayAs === "list"
      ? await toggle.isChecked()
      : !(await toggle.isChecked());

  if (!alreadyCorrect) {
    const patchDone = waitForUpdateEntity(page);

    if (displayAs === "list") {
      await toggle.check();
    } else {
      await toggle.uncheck();
    }

    await patchDone;
  }

  await expect(toggle).toBeChecked({ checked: displayAs === "list" });
};

/**
 * Opens a section from its sidebar link and ensures its shortcuts are
 * expanded. If they are collapsed, clicks the expand button and waits for
 * the `updateEntity` PATCH to complete (FE-600).
 *
 * The section must already be in list mode: the shortcuts are only rendered
 * in list mode, and only while the section's own page is open.
 */
export const expandSidebarSection = async ({
  page,
  section,
}: {
  page: Page;
  section: "Entities" | "Types";
}) => {
  const sidebar = page.getByTestId("page-sidebar");

  await sidebar.getByRole("link", { name: section, exact: true }).click();
  await page.waitForURL(
    (url) => url.pathname === sidebarSections[section].path,
  );

  const expandButton = sidebar.getByRole("button", {
    name: section,
    exact: true,
  });
  await expect(expandButton).toBeVisible();

  if ((await expandButton.getAttribute("aria-expanded")) !== "true") {
    const expandDone = waitForUpdateEntity(page);
    await expandButton.click();
    await expandDone;
  }

  await expect(expandButton).toHaveAttribute("aria-expanded", "true");
};
