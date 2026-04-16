import { expect, type Page } from "@playwright/test";

const waitForUpdateEntity = (page: Page) =>
  page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      res.url().includes("/graphql") &&
      res.request().postData()?.includes("updateEntity") === true,
  );

/**
 * Changes the user's settings for how entities or types should be
 * displayed in the sidebar, waits for the sidebar to reflect the
 * change, and — in list mode — expands the section.
 *
 * Each step waits for its `updateEntity` PATCH to complete before
 * proceeding to avoid concurrent-update errors on the user entity
 * (see FE-600).
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

  const toggle = page.getByLabel(`${section} as a`);
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

  const sidebar = page.getByTestId("page-sidebar");
  const sidebarLink = sidebar.getByRole("link", {
    name: section,
    exact: true,
  });

  if (displayAs === "list") {
    await expect(sidebarLink).toBeHidden();
  } else {
    await expect(sidebarLink).toBeVisible();
  }
};

/**
 * Ensure a sidebar section is expanded. If the section is collapsed
 * (`MuiCollapse-hidden`), clicks the header and waits for the
 * `updateEntity` PATCH to complete (FE-600).
 *
 * The section must already be in list mode (i.e. the NavLink header
 * exists in the DOM).
 */
export const expandSidebarSection = async ({
  page,
  section,
}: {
  page: Page;
  section: "Entities" | "Types";
}) => {
  const sidebar = page.getByTestId("page-sidebar");

  // The NavLink renders: <div> <div>…header…</div> <div class="MuiCollapse-root">…</div> </div>
  // The Collapse's previousElementSibling contains the section header text.
  const isCollapsed = await sidebar.evaluate((sidebarEl, sectionName) => {
    const collapse = Array.from(
      sidebarEl.querySelectorAll(".MuiCollapse-root"),
    ).find((col) => {
      const text = col.previousElementSibling?.textContent;
      return text != null && text.trim().startsWith(sectionName);
    });
    return collapse?.classList.contains("MuiCollapse-hidden") ?? false;
  }, section);

  if (isCollapsed) {
    const expandDone = waitForUpdateEntity(page);
    await sidebar.getByText(section, { exact: true }).click();
    await expandDone;
  }
};
