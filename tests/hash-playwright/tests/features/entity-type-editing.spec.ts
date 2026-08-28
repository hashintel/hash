import {
  addParent,
  addProperty,
  createEntityType,
  parentCard,
  propertyRow,
  randomTypeName,
  requiredCheckbox,
  saveChanges,
} from "../shared/entity-type-editor";
import { expect, test } from "../shared/runtime";

/**
 * These tests run as alice, the default user for the `features` project.
 * They reach the creation form by URL rather than through the sidebar, so
 * they never write sidebar preferences and cannot conflict with
 * entities-page.spec.ts, which mutates alice's preferences, or with
 * entity-type-creation.spec.ts, which runs as bob for that reason.
 */

test("removing a type's only parent survives a reload", async ({ page }) => {
  const parentName = randomTypeName();
  await createEntityType(page, parentName);

  const childName = randomTypeName();
  const childPath = await createEntityType(page, childName);

  await addParent(page, parentName);
  await saveChanges(page);

  await page.goto(childPath);
  await expect(parentCard(page, parentName)).toBeVisible();

  await parentCard(page, parentName).hover();
  await parentCard(page, parentName).getByTestId("type-card-delete").click();
  await expect(parentCard(page, parentName)).toHaveCount(0);

  await saveChanges(page);

  await page.goto(childPath);
  await expect(page.getByTestId("inheritance-row")).toBeVisible();
  await expect(page.getByText("No other types yet")).toBeVisible();
  await expect(
    page.getByTestId("inheritance-row").getByTestId("type-card"),
  ).toHaveCount(0);
});

test("unchecking the last required property survives a reload", async ({
  page,
}) => {
  const typeName = randomTypeName();
  const typePath = await createEntityType(page, typeName);

  await addProperty(page, "Description");
  await expect(requiredCheckbox(page, "Description")).not.toBeChecked();
  await requiredCheckbox(page, "Description").check();
  await saveChanges(page);

  await page.goto(typePath);
  await expect(requiredCheckbox(page, "Description")).toBeChecked();

  await requiredCheckbox(page, "Description").uncheck();
  await saveChanges(page);

  await page.goto(typePath);
  await expect(requiredCheckbox(page, "Description")).toBeVisible();
  await expect(requiredCheckbox(page, "Description")).not.toBeChecked();
});

test("removing one of two properties leaves the other in place", async ({
  page,
}) => {
  const typeName = randomTypeName();
  const typePath = await createEntityType(page, typeName);

  await addProperty(page, "Description");
  await addProperty(page, "Location");
  await saveChanges(page);

  await page.goto(typePath);
  await expect(propertyRow(page, "Description")).toHaveCount(1);
  await expect(propertyRow(page, "Location")).toHaveCount(1);

  await propertyRow(page, "Description")
    .getByTestId("type-menu-trigger")
    .click();
  await page.getByTestId("type-menu-remove").click();
  await expect(propertyRow(page, "Description")).toHaveCount(0);

  await saveChanges(page);

  await page.goto(typePath);
  await expect(propertyRow(page, "Location")).toHaveCount(1);
  await expect(propertyRow(page, "Description")).toHaveCount(0);
});

test("saving an edit bumps the version and serves the new schema", async ({
  page,
}) => {
  const typeName = randomTypeName();
  const typePath = await createEntityType(page, typeName);

  await addProperty(page, "Description");
  await saveChanges(page);

  await page.goto(`${typePath}/v/2`);
  await expect(propertyRow(page, "Description")).toHaveCount(1);

  await page.goto(`${typePath}/v/1`);
  await expect(page.getByTestId("inheritance-row")).toBeVisible();
  await expect(page.getByTestId("property-row")).toHaveCount(0);

  await page.goto(typePath);
  await expect(propertyRow(page, "Description")).toHaveCount(1);
});
