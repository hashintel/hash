import { sleep } from "@local/hash-isomorphic-utils/sleep";

import { loginUsingTempForm } from "./shared/login-using-temp-form";
import { resetDb } from "./shared/reset-db";
import type { Locator, Page } from "./shared/runtime";
import { expect, test } from "./shared/runtime";

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

const ROW_HEIGHT = 42;

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

  const cellY = canvasPos.y + 20 + ROW_HEIGHT * (rowIndex + 1);
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

  // search entity type `GitHub Account`
  await page
    .getByPlaceholder("Search for an entity type")
    .fill("GitHub Account");

  // create a new `GitHub Account`
  await page.getByTestId("selector-autocomplete-option").first().click();

  // select property table
  const canvas = page.locator(".dvn-underlay > canvas:first-of-type").first();

  await clickOnValueCell(page, canvas, 0);

  const profileUrl = "https://github.com/Example";
  await sleep(200);

  await page.keyboard.type(profileUrl);
  await page.keyboard.press("Enter");

  const cell1Text = await getCellText(canvas, 1, 0);

  expect(cell1Text).toBe(profileUrl);
});
