import { expectFullyShown } from "../../shared/expect-fully-shown";
import {
  generateHostileTestDocx,
  generateDocx,
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
  getDocxSearchMarks,
  uploadAndOpenFile,
} from "../../shared/file-preview/utils";
import { expect, test } from "../../shared/runtime";

const [firstPage, secondPage, thirdPage] = testDocumentPages;

test.describe("DOCX preview", () => {
  test.beforeEach(async ({ page }) => {
    await uploadAndOpenFile(page, {
      contents: await generateDocx(testDocumentPages),
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

  test("zooming out stops at 25%", async ({ page }) => {
    const zoomOut = page.getByRole("button", { name: "Zoom out" });

    for (const label of ["80%", "60%", "40%", "25%", "25%"]) {
      await zoomOut.click();
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("ctrl+wheel leaves the zoom to the zoom buttons", async ({ page }) => {
    await getDocxPage(page, firstPage.heading).hover();
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -500);
    await page.keyboard.up("Control");

    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(page.getByText("120%", { exact: true })).toBeVisible();
  });

  test("the page counter follows scrolling and keeps its total after a zoom", async ({
    page,
  }) => {
    const pageCount = testDocumentPages.length;
    // folio renders its own hidden page status, which is not a paragraph.
    const pageCounter = page.locator("p", {
      hasText: new RegExp(`^\\d+ of ${pageCount}$`),
    });

    await expect(pageCounter).toHaveText(`1 of ${pageCount}`);

    await getDocxPage(page, secondPage.heading).evaluate((element) =>
      element.scrollIntoView({ block: "start" }),
    );
    await expect(pageCounter).toHaveText(`2 of ${pageCount}`);

    const docxPage = getDocxPage(page, secondPage.heading);
    const widthBeforeZoom = (await docxPage.boundingBox())?.width ?? 0;
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect
      .poll(async () => (await docxPage.boundingBox())?.width ?? 0)
      .toBeGreaterThan(widthBeforeZoom);
    await expect(pageCounter).toBeVisible();
  });

  test("search highlights every hit and the next result moves to the next page holding it, then back to the first hit", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Show search" }).click();
    const searchInput = page.getByPlaceholder("Search the document...");
    await expectFullyShown(searchInput);
    await searchInput.fill(testDocumentSearchWord);

    await expect(page.getByText("1 of 2", { exact: true })).toBeVisible();
    await expect
      .poll(() => getDocxSearchMarks(page))
      .toEqual({ hits: ["0", "1"], current: ["0"] });

    const nextResult = page.getByRole("button", { name: "Next result" });
    await expectFullyShown(nextResult);
    await nextResult.click();
    await expect(page.getByText("2 of 2", { exact: true })).toBeVisible();
    await expect(getDocxPage(page, thirdPage.heading)).toBeInViewport();
    await expect
      .poll(() => getDocxSearchMarks(page))
      .toEqual({ hits: ["0", "1"], current: ["1"] });

    await nextResult.click();
    await expect(page.getByText("1 of 2", { exact: true })).toBeVisible();
    await expect(getDocxPage(page, firstPage.heading)).toBeInViewport();
    await expect
      .poll(() => getDocxSearchMarks(page))
      .toEqual({ hits: ["0", "1"], current: ["0"] });
  });

  test("a search without results clears the previous hit", async ({ page }) => {
    await page.getByRole("button", { name: "Show search" }).click();
    const searchInput = page.getByPlaceholder("Search the document...");

    await searchInput.fill(testDocumentSearchWord);
    await expect
      .poll(() => getDocxSearchMarks(page))
      .toMatchObject({ current: ["0"] });

    await searchInput.fill("nonexistentword");
    await expect(page.getByText("0 of 0", { exact: true })).toBeVisible();
    await expect
      .poll(() => getDocxSearchMarks(page))
      .toEqual({ hits: [], current: [] });
  });

  test("offers no Open in new tab button", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Download" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open in new tab" }),
    ).toHaveCount(0);
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
  page.context().on("request", (request) => {
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

  const popup = page
    .context()
    .waitForEvent("page", { timeout: 1_000 })
    .catch(() => null);

  const documentPage = page.locator(".layout-page");
  await documentPage.getByText("javascript link", { exact: true }).click();
  await documentPage.getByText("data link", { exact: true }).click();

  expect(dialogs).toEqual([]);
  expect(await popup).toBeNull();
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
  await expect(
    page.getByRole("button", { name: "Open in new tab" }),
  ).toHaveCount(0);
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
