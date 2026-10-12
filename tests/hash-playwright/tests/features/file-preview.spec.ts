import { extractWebIdFromEntityId } from "@blockprotocol/type-system";
import { generateEntityPath } from "@local/hash-isomorphic-utils/frontend-paths";

import { getUser, uploadFile } from "../shared/api-queries";
import {
  generateHostileTestDocx,
  generateTestDocx,
  generateUndrawableTestDocx,
} from "../shared/generate-test-docx";
import { generateTestPdf } from "../shared/generate-test-pdf";
import { expect, test } from "../shared/runtime";
import {
  testDocumentPages,
  testDocumentSearchWord,
} from "../shared/test-document";

import type { Page } from "../shared/runtime";

const [firstPage, secondPage, thirdPage] = testDocumentPages;

const getPdfPage = (page: Page) => page.locator(".react-pdf-page");

const getDocxPage = (page: Page, heading: string) =>
  page.locator(".layout-page", { hasText: heading });

const docxMimeType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const uploadAndOpenFile = async (
  page: Page,
  file: { contents: Buffer; mimeType: string; name: string },
) => {
  const user = await getUser(page.request);
  if (!user) {
    throw new Error("Cannot upload a file without an authenticated user");
  }

  const fileEntity = await uploadFile(page.request, {
    ...file,
    webId: extractWebIdFromEntityId(user.metadata.recordId.entityId),
  });

  await page.goto(
    generateEntityPath({
      entityId: fileEntity.metadata.recordId.entityId,
      includeDraftId: false,
      shortname: "alice",
    }),
  );
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
});

test.describe("DOCX preview", () => {
  test.beforeEach(async ({ page }) => {
    await uploadAndOpenFile(page, {
      contents: generateTestDocx(),
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
    contents: generateHostileTestDocx(),
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

for (const { description, contents } of [
  {
    description: "a corrupt .docx file",
    contents: Buffer.from("Not a ZIP archive"),
  },
  {
    description: "a .docx file folio cannot draw",
    contents: generateUndrawableTestDocx(),
  },
]) {
  test(`${description} falls back to the icon view and keeps the download`, async ({
    page,
  }) => {
    const name = `file-preview-unavailable-${Date.now()}.docx`;

    await uploadAndOpenFile(page, { contents, mimeType: docxMimeType, name });

    await expect(
      page.getByRole("paragraph").filter({ hasText: name }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".layout-page")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Download" })).toBeVisible();
  });
}
