import { expect } from "./runtime";

import type { Locator, Page } from "@playwright/test";

/**
 * Loading a type page runs a subgraph query before the editor renders, which
 * can take longer than an assertion's default budget on a busy runner.
 */
const PAGE_READY_TIMEOUT = 30_000;

export const randomTypeName = () =>
  `TestEntity${(Math.random() * 100000).toFixed()}`;

/**
 * The table of properties, told apart from the table of links by the heading
 * of its first column. A type with no properties shows a card inviting one to
 * be added in place of the table, so this matches nothing for such a type.
 */
export const propertiesTable = (page: Page) =>
  page
    .getByRole("table")
    .filter({ has: page.getByRole("columnheader", { name: "Property name" }) });

export const propertyRow = (page: Page, name: string) =>
  propertiesTable(page).getByRole("row").filter({ hasText: name });

/**
 * The row of parents under the `Extends` heading. It is a plain container with
 * no heading, role or accessible name of its own, so it is reached by test id;
 * what it holds is reached by what the user reads.
 */
export const inheritanceRow = (page: Page) =>
  page.getByTestId("inheritance-row");

/** A parent is shown as a card linking to it, labelled with title and version. */
export const parentCard = (page: Page, name: string) =>
  inheritanceRow(page).getByRole("link", { name });

/**
 * Neither of a property row's two checkboxes is labelled — `Required` and
 * `Allow multiple` are column headings, not names the checkbox carries — so a
 * role does not tell them apart and the test id stays. It sits on the MUI
 * checkbox root; the assertions and actions need the input it wraps.
 */
export const requiredCheckbox = (page: Page, propertyName: string) =>
  propertyRow(page, propertyName)
    .getByTestId("property-required-checkbox")
    .locator('input[type="checkbox"]');

/**
 * Navigate to a type and wait for the editor itself, not just the URL. The
 * `Extends` heading is part of the definition tab, so it appears only once the
 * type has loaded and the skeleton has been replaced.
 */
export const openTypePage = async (page: Page, path: string) => {
  await page.goto(path);
  await expect(
    page.getByRole("heading", { name: "Extends", exact: true }),
  ).toBeVisible({
    timeout: PAGE_READY_TIMEOUT,
  });
};

/**
 * Click the edit bar's confirm button and wait for the mutation it sends to
 * come back, so the change is committed before the caller reloads.
 */
export const publishChanges = async (page: Page, operationName: string) => {
  const confirm = page.getByTestId("editbar-confirm");
  await expect(confirm).toBeVisible();

  const mutationResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/graphql") &&
      (response.request().postData() ?? "").includes(operationName),
  );

  await confirm.click();
  await mutationResponse;
};

export const saveChanges = (page: Page) =>
  publishChanges(page, "updateEntityTypes");

/**
 * Fill in the creation form for a new entity type and leave the browser on
 * the draft editor, where the caller can add properties or parents before
 * publishing.
 */
export const startDraftEntityType = async (page: Page, title: string) => {
  await page.goto("/new/types/entity-type");

  const form = page.getByTestId("entity-type-creation-form");
  await expect(form).toBeVisible();

  await form.locator('input[name="title"]').fill(title);
  await form.locator('textarea[name="description"]').fill("Test Entity");
  await form.locator('input[name="titlePlural"]').fill(`${title}s`);
  await form.locator('button[type="submit"]').click();

  await page.waitForURL(
    (url) =>
      url.pathname.endsWith(title.toLowerCase()) &&
      url.searchParams.has("draft"),
  );
};

/**
 * Publish the draft currently in the editor. Returns the path of the
 * published type.
 *
 * Dropping the `draft` parameter changes the key the page gives the editor,
 * so React replaces the whole tree. Loading the published path afresh leaves
 * the browser on a tree with no pending replacement, where an interaction
 * cannot be discarded by one.
 */
export const publishDraftEntityType = async (page: Page, title: string) => {
  await publishChanges(page, "createEntityType");

  await page.waitForURL(
    (url) =>
      url.pathname.endsWith(title.toLowerCase()) &&
      !url.searchParams.has("draft"),
  );

  const path = new URL(page.url()).pathname;

  await openTypePage(page, path);

  return path;
};

/** Create an entity type with no properties or parents, and publish it. */
export const createEntityType = async (page: Page, title: string) => {
  await startDraftEntityType(page, title);
  return publishDraftEntityType(page, title);
};

/**
 * Attach a type by typing its title and choosing the option with exactly that
 * title, so what follows asserts against a known type rather than whichever
 * option happened to be listed first.
 *
 * `attached` is what the choice should produce. Waiting for it proves the
 * option was taken, where waiting for the selector to disappear would also be
 * satisfied by the editor unmounting for some other reason.
 */
const addTypeByName = async (
  page: Page,
  addAffordanceText: string,
  name: string,
  attached: Locator,
) => {
  await page.getByText(addAffordanceText, { exact: true }).click();

  const selector = page.locator('[data-testid="type-selector"]');
  await expect(selector).toBeVisible();
  await selector.locator("input").fill(name);

  /**
   * Two webs can each hold a type of the same title, so the list can offer
   * more than one option reading exactly the name typed. Any of them will do;
   * what matters is that it is not an option reading something else.
   */
  await page
    .getByRole("option")
    .filter({ has: page.getByText(name, { exact: true }) })
    .first()
    .click();

  await expect(attached).toBeVisible();
};

export const addProperty = (page: Page, name: string) =>
  addTypeByName(page, "Add a property", name, propertyRow(page, name));

export const addParent = (page: Page, name: string) =>
  addTypeByName(page, "ADD TYPE", name, parentCard(page, name));
