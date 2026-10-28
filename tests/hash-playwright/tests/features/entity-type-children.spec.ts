import {
  addParent,
  addProperty,
  createEntityType,
  openTypePage,
  publishDraftEntityType,
  randomTypeName,
  saveChanges,
  startDraftEntityType,
} from "../shared/entity-type-editor";
import { expect, test } from "../shared/runtime";

test("a type's page lists the latest version of each type that extends it", async ({
  page,
}) => {
  test.slow();

  const parentName = randomTypeName();
  const parentPath = await createEntityType(page, parentName);

  const typesThatExtendParent = page.getByRole("region", {
    name: `Types that extend ${parentName}`,
  });

  await expect(typesThatExtendParent).toContainText(
    `No types extend ${parentName} yet.`,
  );

  const childName = randomTypeName();
  await startDraftEntityType(page, childName);
  await addParent(page, parentName);
  await publishDraftEntityType(page, childName);

  await addProperty(page, "Description");
  await saveChanges(page);

  await openTypePage(page, parentPath);

  const childCard = typesThatExtendParent.getByRole("link", {
    name: childName,
  });
  await expect(childCard).toHaveCount(1);
  await expect(childCard).toContainText("v2");

  await childCard.click();

  // Slides render inside MUI's Backdrop, which is aria-hidden, so role queries cannot see them.
  await expect(page.locator("h1").filter({ hasText: childName })).toBeVisible();
  await expect(page).toHaveURL((url) => url.pathname === parentPath);
});
