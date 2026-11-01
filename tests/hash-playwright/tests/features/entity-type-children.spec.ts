import { createEntityType, updateEntityType } from "../shared/api-queries";
import { openTypePage, randomTypeName } from "../shared/entity-type-editor";
import { expect, test } from "../shared/runtime";

import type { Page } from "../shared/runtime";
import type { EntityTypeWithMetadata } from "@blockprotocol/type-system";
import type { ConstructEntityTypeParams } from "@local/hash-graph-sdk/ontology";

const typesThatExtend = (page: Page, typeName: string) =>
  page.getByRole("region", { name: `Types that extend ${typeName}` });

const childCard = (page: Page, parentName: string, childName: string) =>
  typesThatExtend(page, parentName).getByRole("link", { name: childName });

const typeSchema = (
  title: string,
  parent?: EntityTypeWithMetadata,
): ConstructEntityTypeParams => ({
  title,
  description: "Test Entity",
  type: "object",
  properties: {},
  ...(parent ? { allOf: [{ $ref: parent.schema.$id }] } : {}),
});

/** Create v1 of a type that extends `parent`, if given. */
const createType = (
  page: Page,
  title: string,
  parent?: EntityTypeWithMetadata,
) => createEntityType(page.request, typeSchema(title, parent));

/** Save the next version of `entityType`, extending only `parent`, if given. */
const saveNextVersion = (
  page: Page,
  entityType: EntityTypeWithMetadata,
  parent?: EntityTypeWithMetadata,
) =>
  updateEntityType(page.request, {
    entityTypeId: entityType.schema.$id,
    updatedEntityType: typeSchema(entityType.schema.title, parent),
  });

/** The path of a type's page, which shows its latest version. */
const typePath = (entityType: EntityTypeWithMetadata) =>
  new URL(entityType.metadata.recordId.baseUrl).pathname.replace(/\/$/, "");

test("a type's page lists the latest version of each type that extends it", async ({
  page,
}) => {
  const parentName = randomTypeName();
  const parent = await createType(page, parentName);
  const parentPath = typePath(parent);

  await openTypePage(page, parentPath);
  await expect(typesThatExtend(page, parentName)).toContainText(
    `No types extend ${parentName} yet.`,
  );

  const childName = randomTypeName();
  const child = await createType(page, childName, parent);
  await saveNextVersion(page, child, parent);

  await openTypePage(page, parentPath);

  const card = childCard(page, parentName, childName);
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("v2");

  await card.click();

  // Slides render inside MUI's Backdrop, which is aria-hidden, so role queries cannot see them.
  await expect(page.locator("h1").filter({ hasText: childName })).toBeVisible();
  await expect(page).toHaveURL((url) => url.pathname === parentPath);
});

test("a type's page still lists a child whose newer version dropped it, at the version that extends it", async ({
  page,
}) => {
  const parentName = randomTypeName();
  const parent = await createType(page, parentName);
  const childName = randomTypeName();
  const child = await createType(page, childName, parent);
  await saveNextVersion(page, child);

  await openTypePage(page, typePath(parent));
  await expect(childCard(page, parentName, childName)).toContainText("v1");
});

test("an older version's page does not list a type that extends only a newer version", async ({
  page,
}) => {
  const parentName = randomTypeName();
  const parent = await createType(page, parentName);
  const parentV2 = await saveNextVersion(page, parent);
  const childName = randomTypeName();
  await createType(page, childName, parentV2);

  await openTypePage(page, typePath(parent));
  await expect(childCard(page, parentName, childName)).toContainText("v1");

  await openTypePage(page, `${typePath(parent)}/v/1`);
  await expect(typesThatExtend(page, parentName)).toContainText(
    `No types extend ${parentName} yet.`,
  );
});

test("an older version's page lists a child at the version that extends it, after the child was upgraded", async ({
  page,
}) => {
  const parentName = randomTypeName();
  const parent = await createType(page, parentName);
  const childName = randomTypeName();
  const child = await createType(page, childName, parent);

  const parentV2 = await saveNextVersion(page, parent);
  await saveNextVersion(page, child, parentV2);

  await openTypePage(page, typePath(parent));
  await expect(childCard(page, parentName, childName)).toContainText("v2");

  await openTypePage(page, `${typePath(parent)}/v/1`);
  await expect(childCard(page, parentName, childName)).toContainText("v1");
});

test("the newest version's page does not list a child left on an older version", async ({
  page,
}) => {
  const parentName = randomTypeName();
  const parent = await createType(page, parentName);
  const childName = randomTypeName();
  await createType(page, childName, parent);

  await saveNextVersion(page, parent);

  await openTypePage(page, `${typePath(parent)}/v/1`);
  await expect(childCard(page, parentName, childName)).toContainText("v1");

  await openTypePage(page, typePath(parent));
  await expect(typesThatExtend(page, parentName)).toContainText(
    `No types extend ${parentName} yet.`,
  );
});
