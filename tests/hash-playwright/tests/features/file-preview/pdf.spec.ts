import { expectFullyShown } from "../../shared/expect-fully-shown";
import { generatePdf } from "../../shared/file-preview/generate-test-pdf";
import {
  testDocumentPages,
  testDocumentSearchWord,
} from "../../shared/file-preview/test-document";
import {
  expectFileUrlEditOnLaterPageShowsNewFile,
  getPdfPage,
  getSearchHighlights,
  pdf,
  uploadAndOpenFile,
} from "../../shared/file-preview/utils";
import { expect, test } from "../../shared/runtime";

const [firstPage, secondPage, thirdPage] = testDocumentPages;

test.describe("PDF preview", () => {
  test.beforeEach(async ({ page }) => {
    await uploadAndOpenFile(page, {
      contents: generatePdf(testDocumentPages),
      mimeType: "application/pdf",
      name: `file-preview-${Date.now()}.pdf`,
    });

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
    const searchInput = page.getByPlaceholder("Search the document...");
    await expectFullyShown(searchInput);
    await searchInput.fill(testDocumentSearchWord);

    const shownPageHighlights = {
      hits: [testDocumentSearchWord],
      current: [testDocumentSearchWord],
    };

    await expect(page.getByText("1 of 2", { exact: true })).toBeVisible();
    await expect
      .poll(() => getSearchHighlights(page))
      .toEqual(shownPageHighlights);

    const nextResult = page.getByRole("button", { name: "Next result" });
    await expectFullyShown(nextResult);
    await nextResult.click();
    await expect(page.getByText("2 of 2", { exact: true })).toBeVisible();
    await expect(
      pdfPage.getByText(thirdPage.heading, { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() => getSearchHighlights(page))
      .toEqual(shownPageHighlights);
  });

  test("text selected on a page can be copied and pasted", async ({ page }) => {
    await getPdfPage(page)
      .getByText(firstPage.heading, { exact: true })
      .selectText();
    await page.keyboard.press("ControlOrMeta+C");

    await page.getByRole("button", { name: "Show search" }).click();
    const searchInput = page.getByPlaceholder("Search the document...");
    await searchInput.press("ControlOrMeta+V");
    await expect(searchInput).toHaveValue(firstPage.heading);
  });

  test("editing the file URL on a later page shows the new file", ({ page }) =>
    expectFileUrlEditOnLaterPageShowsNewFile(page, pdf));
});
