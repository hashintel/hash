import { createEntityType, updateEntityType } from "../shared/api-queries";
import { openTypePage, randomTypeName } from "../shared/entity-type-editor";
import { expect, test } from "../shared/runtime";

import type { Page } from "../shared/runtime";
import type { EntityTypeWithMetadata } from "@blockprotocol/type-system";
import type { ConstructEntityTypeParams } from "@local/hash-graph-sdk/ontology";

const typesThatExtend = (page: Page, typeName: string) =>
  page.getByRole("region", { name: `Types that extend ${typeName}` });

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

test("a type's page lists each type that extends any of its versions, with the version ranges that extend each version", async ({
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
  const parentV2 = await saveNextVersion(page, parent);
  await saveNextVersion(page, child, parentV2);

  for (const path of [parentPath, `${parentPath}/v/1`]) {
    await openTypePage(page, path);

    const section = typesThatExtend(page, parentName);
    const toggle = section.getByRole("button", {
      name: `${childName} v2`,
      exact: true,
    });
    await expect(toggle).toHaveCount(1);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(
      toggle.locator("xpath=ancestor::tr[1]").getByRole("cell"),
    ).toHaveText([`${childName} v2`, "v1–v2", "v1, v2", ""]);

    await toggle.click();

    // Each range's open button comes after the row's own, which also opens v2.
    for (const version of ["v1", "v2"]) {
      await expect(
        section
          .getByRole("button", { name: `Open ${childName} ${version}` })
          .last()
          .locator("xpath=ancestor::tr[1]")
          .getByRole("cell"),
      ).toHaveText(["", version, version, ""]);
    }
  }

  await openTypePage(page, parentPath);
  await typesThatExtend(page, parentName)
    .getByRole("button", { name: `Open ${childName} v2` })
    .click();

  // Slides render inside MUI's Backdrop, which is aria-hidden, so role queries cannot see them.
  await expect(page.locator("h1").filter({ hasText: childName })).toBeVisible();
  await expect(page).toHaveURL((url) => url.pathname === parentPath);
});

test("a type's page leaves out a type whose latest version no longer extends it", async ({
  page,
}) => {
  const parentName = randomTypeName();
  const parent = await createType(page, parentName);
  const childName = randomTypeName();
  const child = await createType(page, childName, parent);
  await saveNextVersion(page, child);

  await openTypePage(page, typePath(parent));
  await expect(typesThatExtend(page, parentName)).toContainText(
    `No types extend ${parentName} yet.`,
  );
});
