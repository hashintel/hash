import {
  generateHostileTestDocx,
  generateTestDocx,
  generateUndrawableTestDocx,
} from "../../shared/file-preview/generate-test-docx";
import {
  testDocumentPages,
  testDocumentSearchWord,
} from "../../shared/file-preview/test-document";
import {
  docx,
  docxMimeType,
  expectFileUrlEditOnLaterPageShowsNewFile,
  getDocxPage,
  uploadAndOpenFile,
} from "../../shared/file-preview/utils";
import { expect, test } from "../../shared/runtime";

const [firstPage, secondPage, thirdPage] = testDocumentPages;

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

  test("editing the file URL on a later page shows the new file", ({ page }) =>
    expectFileUrlEditOnLaterPageShowsNewFile(page, docx));

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
