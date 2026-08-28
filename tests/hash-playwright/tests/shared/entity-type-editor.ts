import { expect } from "./runtime";

import type { Page } from "@playwright/test";

export const randomTypeName = () =>
  `TestEntity${(Math.random() * 100000).toFixed()}`;

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
  await form.locator("button").click();

  await page.waitForURL(
    (url) =>
      url.pathname.endsWith(title.toLowerCase()) &&
      url.searchParams.has("draft"),
  );
};

/**
 * Publish the draft currently in the editor. Returns the path of the
 * published type, so a test can navigate back to it after a reload.
 */
export const publishDraftEntityType = async (page: Page, title: string) => {
  await publishChanges(page, "createEntityType");

  await page.waitForURL(
    (url) =>
      url.pathname.endsWith(title.toLowerCase()) &&
      !url.searchParams.has("draft"),
  );

  return new URL(page.url()).pathname;
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
 */
const addTypeByName = async (
  page: Page,
  addAffordanceText: string,
  name: string,
) => {
  await page.getByText(addAffordanceText, { exact: true }).click();

  const selector = page.locator('[data-testid="type-selector"]');
  await expect(selector).toBeVisible();
  await selector.locator("input").fill(name);

  /**
   * `and` matches elements that are both an option title and hold exactly the
   * name, rather than a descendant holding it — the title element has no
   * element children for a chained text locator to match.
   */
  await page
    .getByTestId("selector-autocomplete-option-title")
    .and(page.getByText(name, { exact: true }))
    .first()
    .click();

  await expect(selector).toBeHidden();
};

export const addProperty = (page: Page, name: string) =>
  addTypeByName(page, "Add a property", name);

export const addParent = (page: Page, name: string) =>
  addTypeByName(page, "ADD TYPE", name);

export const propertyRow = (page: Page, name: string) =>
  page.getByTestId("property-row").filter({ hasText: name });

export const parentCard = (page: Page, name: string) =>
  page
    .getByTestId("inheritance-row")
    .getByTestId("type-card")
    .filter({ hasText: name });

/**
 * The test id sits on the MUI checkbox root; the assertions and actions need
 * the input it wraps.
 */
export const requiredCheckbox = (page: Page, propertyName: string) =>
  propertyRow(page, propertyName)
    .getByTestId("property-required-checkbox")
    .locator('input[type="checkbox"]');
