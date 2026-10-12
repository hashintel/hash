import { extractWebIdFromEntityId } from "@blockprotocol/type-system";
import { generateEntityPath } from "@local/hash-isomorphic-utils/frontend-paths";

import { getUser, uploadFile } from "../shared/api-queries";
import { generateTestPdf } from "../shared/generate-test-pdf";
import { expect, test } from "../shared/runtime";
import {
  testDocumentPages,
  testDocumentSearchWord,
} from "../shared/test-document";

import type { Page } from "../shared/runtime";

const [firstPage, secondPage, thirdPage] = testDocumentPages;

const getPdfPage = (page: Page) => page.locator(".react-pdf-page");

test.beforeEach(async ({ page }) => {
  const user = await getUser(page.request);
  if (!user) {
    throw new Error("Cannot upload a file without an authenticated user");
  }

  const fileEntity = await uploadFile(page.request, {
    contents: generateTestPdf(),
    mimeType: "application/pdf",
    name: `file-preview-${Date.now()}.pdf`,
    webId: extractWebIdFromEntityId(user.metadata.recordId.entityId),
  });

  await page.goto(
    generateEntityPath({
      entityId: fileEntity.metadata.recordId.entityId,
      includeDraftId: false,
      shortname: "alice",
    }),
  );

  await expect(
    getPdfPage(page).getByText(firstPage.heading, { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
});

test("the next page button shows the next page", async ({ page }) => {
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(
    getPdfPage(page).getByText(secondPage.heading, { exact: true }),
  ).toBeVisible();
});

test("a page thumbnail shows its page", async ({ page }) => {
  await page.getByRole("group", { name: "Page 3", exact: true }).click();
  await expect(
    getPdfPage(page).getByText(thirdPage.heading, { exact: true }),
  ).toBeVisible();
});

test("zooming in makes the page wider", async ({ page }) => {
  const pdfPage = getPdfPage(page);

  const widthBeforeZoom = (await pdfPage.boundingBox())?.width ?? 0;
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect
    .poll(async () => (await pdfPage.boundingBox())?.width ?? 0)
    .toBeGreaterThan(widthBeforeZoom);
});

test("search highlights a word and the next result moves to the next page holding it", async ({
  page,
}) => {
  const pdfPage = getPdfPage(page);

  await page.getByRole("button", { name: "Show search" }).click();
  await page
    .getByPlaceholder("Search the document...")
    .fill(testDocumentSearchWord);

  const searchHighlight = pdfPage.locator('span[style*="border-bottom"]', {
    hasText: testDocumentSearchWord,
  });

  await expect(searchHighlight).toBeVisible();

  await page.getByRole("button", { name: "Next result" }).click();
  await expect(
    pdfPage.getByText(thirdPage.heading, { exact: true }),
  ).toBeVisible();
  await expect(searchHighlight).toBeVisible();
});

test("text selected on a page can be copied and pasted", async ({ page }) => {
  await page.getByRole("button", { name: "Show search" }).click();
  const searchInput = page.getByPlaceholder("Search the document...");

  await getPdfPage(page)
    .getByText(firstPage.heading, { exact: true })
    .selectText();
  await page.keyboard.press("ControlOrMeta+C");
  await searchInput.press("ControlOrMeta+V");
  await expect(searchInput).toHaveValue(firstPage.heading);
});
