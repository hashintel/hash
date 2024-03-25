import { gridRowHeight } from "@local/hash-isomorphic-utils/data-grid";
import { sleep } from "@local/hash-isomorphic-utils/sleep";

import { loginUsingTempForm } from "./shared/login-using-temp-form";
import { resetDb } from "./shared/reset-db";
import type { Locator, Page } from "./shared/runtime";
import { expect, test } from "./shared/runtime";

/**
 * This gets the text for the requested cell in the hidden html table,
 * which replicates the rendered content for accessibility and testing purposes.
 *
 * The presence of a value in the HTML table does not guarantee that it is rendered on the canvas,
 * which depends on the canvas cell renderers correctly taking the value and drawing it.
 */
const getCellText = async (
  canvas: Locator,
  /** zero-based (first column -> 0) */
  colIndex: number,
  /** zero-based (first row after header row -> 0) */
  rowIndex: number,
) => {
  // wait until glide-grid updates the cell texts (on the invisible accessibility table)
  await sleep(500);

  const text = await canvas
    .getByTestId(`glide-cell-${colIndex}-${rowIndex}`)
    .textContent();
  return text;
};

/**
 * Check that there is content rendered in the first cell of the first non-header row
 */
const checkIfCellContainsNonWhitePixels = async (canvasLocator: Locator) => {
  const hasNonWhitePixels = await (
    await canvasLocator.elementHandle()
  )?.evaluate((canvas, rowHeight) => {
    /**
     * The return of evaluate is JSON.stringified, and therefore functions cannot be serialized.
     * We must do all work that requires functions inside the callback.
     */
    const context = (canvas as HTMLCanvasElement).getContext("2d");

    if (!context) {
      throw new Error("Could not get canvas context");
    }

    /** Start our check a few pixels in so that we ignore borders */
    const firstValueCellXPosition = 5;

    /**
     * The canvas's width/height are twice their rendered size, so we need to double the desired height to get the right offset.
     * This is different to clickOnValueCell, which is using mouse positioning on the rendered DOM rather than the canvas's size.
     *
     * Add 5 to account so that we ignore any borders or other pixels that may be introduced that aren't the main content.
     */
    const firstValueCellYPosition = rowHeight * 2 + 5;

    /** Check a width that should include any rendered content without risking straying to the end of the cell */
    const widthToCheck = 100;

    /** Checking half the height should be sufficient to cover any content rendered in the middle of the cell */
    const heightToCheck = rowHeight / 2;

    const imageData = context.getImageData(
      firstValueCellXPosition,
      firstValueCellYPosition,
      widthToCheck,
      heightToCheck,
    );

    const nonWhitePixels = imageData.data.filter((pixel) => pixel !== 255);

    return nonWhitePixels.length > 0;
  }, gridRowHeight);

  return hasNonWhitePixels;
};

/**
 * Click on the cell containing the value in the properties table
 */
const clickOnValueCell = async (
  page: Page,
  canvas: Locator,
  /** zero-based (first row after header row -> 0) */
  rowIndex: number,
) => {
  const canvasPos = await canvas.boundingBox();

  if (!canvasPos) {
    throw new Error("canvasPos not found");
  }

  /** The Y offset for the center of the requested row */
  const cellY =
    canvasPos.y + gridRowHeight * (rowIndex + 1) + gridRowHeight / 2;

  /** The X offset for somewhere in the second column, which holds property values */
  const cellX = canvasPos.x + 300;

  await page.mouse.move(cellX, cellY);
  await page.mouse.click(cellX, cellY);
};

test.beforeEach(async () => {
  await resetDb();
});

/** This is a temporary test to commit the progress made on testing `Grid` component. */
test("user can update values on property table", async ({ page }) => {
  await loginUsingTempForm({
    page,
    userEmail: "alice@example.com",
    userPassword: "password",
  });

  await expect(page.locator("text=Welcome to HASH")).toBeVisible();

  await page.goto(`/new/entity`);

  await page.waitForURL((url) => !!url.pathname.match(/^\/new\/entity/));

  await page.getByRole("button", { name: "Add a type" }).click();

  await page
    .getByPlaceholder("Search for an entity type")
    .fill("GitHub Account");

  // select 'GitHub Account' as the type for this entity
  await page.getByTestId("selector-autocomplete-option").first().click();

  const propertyTableCanvas = page
    .locator(".dvn-underlay > canvas:first-of-type")
    .first();

  await clickOnValueCell(page, propertyTableCanvas, 0);

  const profileUrl = "https://github.com/Example";
  await sleep(200);

  await page.keyboard.type(profileUrl);
  await page.keyboard.press("Enter");

  /**
   * Check that the hidden accessibility / testing HTML table contains the correct value.
   * This tests that the value has been successfully entered, but not that it is rendered.
   */
  const cell1Text = await getCellText(propertyTableCanvas, 1, 0);

  expect(cell1Text).toBe(profileUrl);
});

test("both the link and properties tables renders some content", async ({
  page,
}) => {
  await loginUsingTempForm({
    page,
    userEmail: "alice@example.com",
    userPassword: "password",
  });

  await expect(page.locator("text=Welcome to HASH")).toBeVisible();

  await page.goto(`/new/entity`);

  await page.waitForURL((url) => !!url.pathname.match(/^\/new\/entity/));

  await page.getByRole("button", { name: "Add a type" }).click();

  /**
   * Get the `Document` type ('document format' appears in its description but not that of other types mentioning 'Document')
   */
  await page
    .getByPlaceholder("Search for an entity type")
    .fill("document format");

  await page.getByTestId("selector-autocomplete-option").first().click();

  const linkTableCanvas = page
    .locator(".dvn-underlay > canvas:first-of-type")
    .nth(1);

  const linkTableHasRenderedContent =
    await checkIfCellContainsNonWhitePixels(linkTableCanvas);

  expect(linkTableHasRenderedContent).toEqual(true);

  const propertyTableCanvas = page
    .locator(".dvn-underlay > canvas:first-of-type")
    .first();

  const propertyTableHasRenderedContent =
    await checkIfCellContainsNonWhitePixels(propertyTableCanvas);

  expect(propertyTableHasRenderedContent).toEqual(true);
});
