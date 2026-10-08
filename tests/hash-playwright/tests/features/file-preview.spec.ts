import { extractWebIdFromEntityId } from "@blockprotocol/type-system";
import { generateEntityPath } from "@local/hash-isomorphic-utils/frontend-paths";

import { getUser, uploadFile } from "../shared/api-queries";
import {
  generateTestPdf,
  testPdfSearchWord,
} from "../shared/generate-test-pdf";
import { expect, test } from "../shared/runtime";

test("a PDF file entity shows a preview that can be paged, zoomed and searched", async ({
  page,
}) => {
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

  const pdfPage = page.locator(".react-pdf-page");

  await expect(pdfPage.getByText("Page 1", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Next page" }).click();
  await expect(pdfPage.getByText("Page 2", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Page 1", exact: true }).click();
  await expect(pdfPage.getByText("Page 1", { exact: true })).toBeVisible();

  const widthBeforeZoom = (await pdfPage.boundingBox())?.width ?? 0;
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect
    .poll(async () => (await pdfPage.boundingBox())?.width ?? 0)
    .toBeGreaterThan(widthBeforeZoom);

  await page.getByRole("button", { name: "Show search" }).click();
  await page.getByPlaceholder("Search the document...").fill(testPdfSearchWord);

  const searchHighlight = pdfPage.locator('span[style*="border-bottom"]', {
    hasText: testPdfSearchWord,
  });

  await expect(searchHighlight).toBeVisible();

  await page.getByRole("button", { name: "Next result" }).click();
  await expect(pdfPage.getByText("Page 3", { exact: true })).toBeVisible();
  await expect(searchHighlight).toBeVisible();
});
