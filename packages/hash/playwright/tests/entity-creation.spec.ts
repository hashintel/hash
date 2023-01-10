import { loginUsingTempForm } from "./shared/login-using-temp-form";
import { resetDb } from "./shared/reset-db";
import { expect, Locator, Page, test } from "./shared/runtime";

const getCellText = async (
  canvasLocator: Locator,
  colIndex: number,
  rowIndex: number,
) => {
  const text = await canvasLocator
    .getByTestId(`glide-cell-${colIndex}-${rowIndex}`)
    .textContent();
  return text;
};

const ROW_HEIGHT = 42;

const clickOnValueCell = async (
  page: Page,
  canvasLocator: Locator,
  colIndex: number,
) => {
  const canvasPos = await canvasLocator.boundingBox();

  if (!canvasPos) {
    throw new Error("canvasPos not found");
  }

  const cellY = canvasPos.y + 20 + ROW_HEIGHT * (colIndex + 1);
  const cellX = canvasPos.x + 300;
  await page.mouse.move(cellX, cellY);
  await page.mouse.click(cellX, cellY);
};

test.beforeEach(async () => {
  await resetDb();
});

const value1 = "John";
const value2 = "Doe";

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

  // search entity type `Comment`
  await page.getByPlaceholder("Search for an entity type").fill("Comment");

  // create a new `Comment`
  await page.getByTestId("property-selector-option").first().click();

  // select property table
  const canvas = page.locator(".dvn-underlay > canvas:first-of-type").first();

  await clickOnValueCell(page, canvas, 0);
  await page.keyboard.type(value1);
  await page.keyboard.press("Enter");

  await clickOnValueCell(page, canvas, 1);
  await page.keyboard.type(value2);
  await page.keyboard.press("Enter");

  const cell1Text = await getCellText(canvas, 1, 0);
  const cell2Text = await getCellText(canvas, 1, 1);

  expect(cell1Text).toBe(value1);
  expect(cell2Text).toBe(value2);
});
