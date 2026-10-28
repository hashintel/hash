import {
  addParent,
  createEntityType,
  openTypePage,
  publishDraftEntityType,
  randomTypeName,
  startDraftEntityType,
} from "../shared/entity-type-editor";
import { expect, test } from "../shared/runtime";

test("a type's page lists the types that extend it", async ({ page }) => {
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

  await openTypePage(page, parentPath);
  await typesThatExtendParent.getByRole("link", { name: childName }).click();

  // Slides render inside MUI's Backdrop, which is aria-hidden, so role queries cannot see them.
  await expect(page.locator("h1").filter({ hasText: childName })).toBeVisible();
});
