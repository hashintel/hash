import { extractWebIdFromEntityId } from "@blockprotocol/type-system";
import { gridRowHeight } from "@local/hash-isomorphic-utils/data-grid";
import { generateEntityPath } from "@local/hash-isomorphic-utils/frontend-paths";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import { getUser, uploadFile } from "../shared/api-queries";
import {
  generateHostileTestDocx,
  generateTestDocx,
  generateUndrawableTestDocx,
} from "../shared/generate-test-docx";
import { generateTestPdf } from "../shared/generate-test-pdf";
import { expect, test } from "../shared/runtime";
import {
  otherTestDocumentPages,
  otherTestDocumentSearchWord,
  testDocumentPages,
  testDocumentSearchWord,
} from "../shared/test-document";

import type { Page } from "../shared/runtime";

const [firstPage, secondPage, thirdPage] = testDocumentPages;
const [otherDocumentPage] = otherTestDocumentPages;

const getPdfPage = (page: Page) => page.locator(".react-pdf-page");

const getDocxPage = (page: Page, heading: string) =>
  page.locator(".layout-page", { hasText: heading });

/**
 * The page and zoom labels. The DOCX preview also announces the page in a
 * status element, so the label is told apart by its role.
 */
const getLabel = (page: Page, text: string) =>
  page.getByRole("paragraph").and(page.getByText(text, { exact: true }));

const docxMimeType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type TestFile = { contents: Buffer; mimeType: string; name: string };

const uploadTestFile = async (page: Page, file: TestFile) => {
  const user = await getUser(page.request);
  if (!user) {
    throw new Error("Cannot upload a file without an authenticated user");
  }

  return uploadFile(page.request, {
    ...file,
    webId: extractWebIdFromEntityId(user.metadata.recordId.entityId),
  });
};

const uploadAndOpenFile = async (page: Page, file: TestFile) => {
  const fileEntity = await uploadTestFile(page, file);

  await page.goto(
    generateEntityPath({
      entityId: fileEntity.metadata.recordId.entityId,
      includeDraftId: false,
      shortname: "alice",
    }),
  );
};

const uploadTestFileAndGetUrl = async (page: Page, file: TestFile) => {
  const fileEntity = await uploadTestFile(page, file);

  return simplifyProperties(fileEntity.properties).fileUrl;
};

/**
 * Changes the "File URL" value in the properties table without saving the
 * entity. The table draws its cells on a canvas, so the cell is reached with
 * the keyboard from the first row.
 */
const editFileUrl = async (page: Page, fileUrl: string) => {
  const fileUrlLabelTestId = await page
    .locator(".dvn-underlay > canvas:first-of-type")
    .first()
    .locator('[data-testid^="glide-cell-0-"]', { hasText: /^File URL$/ })
    .getAttribute("data-testid");
  const fileUrlRowIndex = Number(fileUrlLabelTestId?.split("-").at(-1));

  await page
    .locator(".dvn-scroller")
    .first()
    .click({ position: { x: 20, y: gridRowHeight * 1.5 } });
  for (let rowIndex = 0; rowIndex < fileUrlRowIndex; rowIndex++) {
    await page.keyboard.press("ArrowDown");
  }
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");

  const valueInput = page.getByPlaceholder("Start typing...");
  await valueInput.fill(fileUrl);
  await valueInput.press("Enter");
};

/**
 * Zooms in, searches for `testDocumentSearchWord` and moves to page 2, then
 * changes the file URL to a one-page file that does not hold that word.
 */
const zoomSearchAndEditFileUrl = async (page: Page, otherFileUrl: string) => {
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(getLabel(page, "120%")).toBeVisible();

  await page.getByRole("button", { name: "Show search" }).click();
  await page
    .getByPlaceholder("Search the document...")
    .fill(testDocumentSearchWord);
  await expect(page.getByText("1 of 2", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Next page" }).click();
  await expect(getLabel(page, "2 of 3")).toBeVisible();

  await editFileUrl(page, otherFileUrl);
};

const expectStateOfOtherFile = async (page: Page) => {
  await expect(getLabel(page, "1 of 1")).toBeVisible();
  await expect(getLabel(page, "100%")).toBeVisible();

  const searchInput = page.getByPlaceholder("Search the document...");
  await expect(searchInput).toHaveValue("");
  await expect(page.getByRole("button", { name: "Next result" })).toBeHidden();

  await searchInput.fill(otherTestDocumentSearchWord);
  await expect(page.getByText("1 of 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next result" }).click();
  await expect(page.getByText("2 of 2", { exact: true })).toBeVisible();
};

test.describe("PDF preview", () => {
  test.beforeEach(async ({ page }) => {
    await uploadAndOpenFile(page, {
      contents: generateTestPdf(),
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
    await getPdfPage(page)
      .getByText(firstPage.heading, { exact: true })
      .selectText();
    await page.keyboard.press("ControlOrMeta+C");

    await page.getByRole("button", { name: "Show search" }).click();
    const searchInput = page.getByPlaceholder("Search the document...");
    await searchInput.press("ControlOrMeta+V");
    await expect(searchInput).toHaveValue(firstPage.heading);
  });

  test("editing the file URL shows the new file's pages, zoom and search state", async ({
    page,
  }) => {
    const otherFileUrl = await uploadTestFileAndGetUrl(page, {
      contents: generateTestPdf(otherTestDocumentPages),
      mimeType: "application/pdf",
      name: `file-preview-other-${Date.now()}.pdf`,
    });

    await zoomSearchAndEditFileUrl(page, otherFileUrl);

    await expect(
      getPdfPage(page).getByText(otherDocumentPage.heading, { exact: true }),
    ).toBeVisible();
    await expectStateOfOtherFile(page);
  });
});

test.describe("DOCX preview", () => {
  test.beforeEach(async ({ page }) => {
    await uploadAndOpenFile(page, {
      contents: await generateTestDocx(),
      mimeType: docxMimeType,
      name: `file-preview-${Date.now()}.docx`,
    });

    await expect(getDocxPage(page, firstPage.heading)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("the next and previous page buttons move between pages", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(getDocxPage(page, secondPage.heading)).toBeInViewport();

    await page.getByRole("button", { name: "Previous page" }).click();
    await expect(getDocxPage(page, firstPage.heading)).toBeInViewport();
  });

  test("zooming in makes the page wider", async ({ page }) => {
    const docxPage = getDocxPage(page, firstPage.heading);

    const widthBeforeZoom = (await docxPage.boundingBox())?.width ?? 0;
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect
      .poll(async () => (await docxPage.boundingBox())?.width ?? 0)
      .toBeGreaterThan(widthBeforeZoom);
  });

  test("search selects a word and the next result moves to the next page holding it", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Show search" }).click();
    await page
      .getByPlaceholder("Search the document...")
      .fill(testDocumentSearchWord);
    await expect(page.getByText("1 of 2", { exact: true })).toBeVisible();
    await expect(page.locator("[data-folio-selection-rect]")).toBeVisible();

    await page.getByRole("button", { name: "Next result" }).click();
    await expect(page.getByText("2 of 2", { exact: true })).toBeVisible();
    await expect(getDocxPage(page, thirdPage.heading)).toBeInViewport();
    await expect(page.locator("[data-folio-selection-rect]")).toBeVisible();
  });

  test("a search without results clears the previous hit", async ({ page }) => {
    await page.getByRole("button", { name: "Show search" }).click();
    const searchInput = page.getByPlaceholder("Search the document...");

    await searchInput.fill(testDocumentSearchWord);
    await expect(page.locator("[data-folio-selection-rect]")).toBeVisible();

    await searchInput.fill("nonexistentword");
    await expect(page.getByText("0 of 0", { exact: true })).toBeVisible();
    await expect(page.locator("[data-folio-selection-rect]")).toHaveCount(0);
  });

  test("the preview cannot be edited", async ({ page }) => {
    const docxPage = getDocxPage(page, firstPage.heading);
    const textBefore = (await docxPage.textContent()) ?? "";

    await docxPage.getByText(firstPage.heading, { exact: true }).click();
    await page.keyboard.type("typed text");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Delete");

    await expect(docxPage).toHaveText(textBefore);
  });

  test("editing the file URL shows the new file's pages, zoom and search state", async ({
    page,
  }) => {
    const otherFileUrl = await uploadTestFileAndGetUrl(page, {
      contents: await generateTestDocx(otherTestDocumentPages),
      mimeType: docxMimeType,
      name: `file-preview-other-${Date.now()}.docx`,
    });

    await zoomSearchAndEditFileUrl(page, otherFileUrl);

    await expect(getDocxPage(page, otherDocumentPage.heading)).toBeVisible();
    await expectStateOfOtherFile(page);
  });

  test("text selected on a page copies exactly", async ({ page }) => {
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);

    const heading = page
      .locator(".layout-page")
      .first()
      .getByText(firstPage.heading, { exact: true });

    const box = await heading.boundingBox();
    if (!box) {
      throw new Error("The heading on page 1 has no bounding box");
    }
    const lineY = box.y + box.height / 2;
    await page.mouse.move(box.x + 1, lineY);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 1, lineY, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.press("ControlOrMeta+C");

    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(firstPage.heading);
  });
});

test("the DOCX preview runs and loads nothing from a hostile document", async ({
  page,
}) => {
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });

  const outsideRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname !== "localhost") {
      outsideRequests.push(request.url());
    }
  });

  await uploadAndOpenFile(page, {
    contents: await generateHostileTestDocx(),
    mimeType: docxMimeType,
    name: `file-preview-hostile-${Date.now()}.docx`,
  });

  await expect(
    page.locator(".layout-page", { hasText: "Hostile document" }),
  ).toBeVisible({ timeout: 15_000 });

  const preview = page.locator("[data-folio-scroll]");
  await expect(preview.locator("script")).toHaveCount(0);
  await expect(preview.locator("iframe")).toHaveCount(0);
  await expect(
    preview.locator('a[href^="javascript:"], a[href^="data:"]'),
  ).toHaveCount(0);
  await expect(
    preview.locator("[onerror], [onload], [onclick], [onmouseover]"),
  ).toHaveCount(0);

  await page.locator(".layout-page", { hasText: "javascript link" }).click();
  await page.locator(".layout-page", { hasText: "data link" }).click();

  expect(dialogs).toEqual([]);
  expect(outsideRequests).toEqual([]);
});

test("a .doc file keeps the icon view", async ({ page }) => {
  const name = `file-preview-${Date.now()}.doc`;

  await uploadAndOpenFile(page, {
    contents: Buffer.from("Not a Word 97-2003 document"),
    mimeType: "application/msword",
    name,
  });

  await expect(
    page.getByRole("paragraph").filter({ hasText: name }),
  ).toBeVisible();
  await expect(page.locator(".layout-page")).toHaveCount(0);
});

test("a corrupt .docx file falls back to the icon view and keeps the download", async ({
  page,
}) => {
  const name = `file-preview-unavailable-${Date.now()}.docx`;

  await uploadAndOpenFile(page, {
    contents: Buffer.from("Not a ZIP archive"),
    mimeType: docxMimeType,
    name,
  });

  await expect(
    page.getByRole("paragraph").filter({ hasText: name }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".layout-page")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download" })).toBeVisible();
});

test.describe("a .docx file folio cannot draw", () => {
  // React logs the refusal that the preview's error boundary catches.
  test.use({
    tolerableConsoleMessages: [
      /^ProseMirrorDocumentValidationError: Document conversion produced an invalid ProseMirror document:/,
    ],
  });

  test("falls back to the icon view and keeps the download", async ({
    page,
  }) => {
    const name = `file-preview-unavailable-${Date.now()}.docx`;

    await uploadAndOpenFile(page, {
      contents: await generateUndrawableTestDocx(),
      mimeType: docxMimeType,
      name,
    });

    await expect(
      page.getByRole("paragraph").filter({ hasText: name }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".layout-page")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Download" })).toBeVisible();
  });
});
