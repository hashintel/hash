import { test, expect } from "@playwright/test";
import { sleep } from "@hashintel/hash-shared/sleep";
import { loginUsingUi } from "./utils/login-using-ui";
import { resetDb } from "./utils/reset-db";

const pageNameSuffix = Date.now();
const pageNameFallback = "Untitled";

const listOfPagesSelector = '[data-testid="pages-tree"]';
const pageTitleInputSelector = '[placeholder="Untitled"]';

const modifierKey = process.platform === "darwin" ? "Meta" : "Control";

/**
 * not calling resetDb in beforeEach
 * because "user can rename page" uses the page created at "user can create page"
 */
test.beforeAll(async () => {
  await resetDb();
});

test("user can create page", async ({ page }) => {
  await loginUsingUi({
    page,
    accountShortName: "alice",
  });

  // TODO: Check if we are on the user page
  await expect(page.locator("text=Welcome to HASH")).toBeVisible();

  // TODO: Check URL contains own login once we have replaced uuids implemented
  await page.waitForURL((url) => !!url.pathname.match(/^\/[\w-]+$/));

  // Create the new page
  await page.locator('[data-testid="create-page-btn"]').click();

  await page.waitForURL((url) => !!url.pathname.match(/^\/[\w-]+\/[\w-]+$/));

  const blockRegionLocator = page.locator("#root");
  const listOfPagesLocator = page.locator(listOfPagesSelector);

  // Wait for ProseMirror to load
  // TODO: investigate why page renaming before block loading is unstable
  await expect(
    blockRegionLocator.locator('[data-testid="block-handle"]'),
  ).toHaveCount(1);
  await expect(listOfPagesLocator).toContainText(pageNameFallback);

  // Type in a paragraph block
  await blockRegionLocator.locator("p div").click();
  await page.keyboard.type("My test paragraph with ");
  await page.keyboard.press(`${modifierKey}+b`);
  await page.keyboard.type("bold");
  await page.keyboard.press(`${modifierKey}+b`);
  await page.keyboard.type(" and ");
  await page.keyboard.press(`${modifierKey}+i`);
  await page.keyboard.type("italics");
  await page.keyboard.press(`${modifierKey}+i`);

  // Insert a divider
  await sleep(100); // TODO: investigate flakiness in FF and Webkit
  await page.keyboard.press("Enter");
  await sleep(100); // TODO: investigate flakiness in FF and Webkit
  await page.keyboard.type("/divider");
  await sleep(100); // TODO: investigate flakiness in FF and Webkit
  await page.keyboard.press("Enter");
  await sleep(100); // TODO: investigate flakiness in FF and Webkit

  // Wait for divider block to load
  await expect(blockRegionLocator).not.toContainText("Loading...", {
    timeout: 10000,
  });
  await expect(blockRegionLocator.locator("hr")).toBeVisible();

  // TODO: Move the cursor below the new divider and update the test?

  // Insert a paragraph creation with newlines
  await sleep(100); // TODO: investigate flakiness in FF and Webkit
  await page.keyboard.type("Second paragraph");
  await sleep(100); // TODO: investigate flakiness in FF and Webkit
  await page.keyboard.press("Shift+Enter");
  await sleep(100); // TODO: investigate flakiness in FF and Webkit
  await page.keyboard.press("Shift+Enter");
  await sleep(100); // TODO: investigate flakiness in FF and Webkit
  await page.keyboard.type("with");
  await page.keyboard.press("Shift+Enter");
  await sleep(100); // TODO: investigate flakiness in FF and Webkit
  await page.keyboard.type("line breaks");
  await sleep(100); // TODO: investigate flakiness in FF and Webkit

  // Expect just inserted content to be present on the page
  await expect(blockRegionLocator).toContainText(
    "My test paragraph with bold and italics",
    // "My test paragraph with bold and italics\nSecond paragraph\nwith\nline breaks",
    { useInnerText: true }, // Prevents words from sticking to each other
  );

  // Check number of blocks
  await expect(
    blockRegionLocator.locator('[data-testid="block-handle"]'),
  ).toHaveCount(3);

  await page.keyboard.press("Enter");
  await sleep(100); // TODO: investigate flakiness in FF and Webkit

  await expect(
    blockRegionLocator.locator('[data-testid="block-handle"]'),
  ).toHaveCount(4);

  const blockChanger = blockRegionLocator
    .locator('[data-testid="block-changer"]')
    .nth(2);
  await blockChanger.click();

  const blockContextMenu = page.locator('[data-testid="block-context-menu"]');

  await blockContextMenu
    .locator('[placeholder="Load block from URL..."]')
    .fill("https://blockprotocol.org/blocks/@hash/code");

  /**
   * This is creating a new block above the current one, instead of switching
   * block. This is a bug, and results in us having one extra block than
   * intended, which impacts the rest of this test.
   *
   * @see https://app.asana.com/0/1201095311341924/1202033760322934/f
   */
  await blockContextMenu.locator("text=Re-load block").click();

  await expect(
    blockContextMenu.locator('[placeholder="Load block from URL..."]'),
  ).toHaveCount(0, { timeout: 2000 });

  await expect(
    blockRegionLocator.locator(`[data-testid="block"]:nth-child(3) p`),
  ).toHaveCount(0);

  // Give collab some time to sync data
  await sleep(2000);

  // Check content stability after page reload
  await page.reload();

  await expect(blockRegionLocator.locator("p").nth(0)).toContainText(
    "My test paragraph with bold and italics",
    { useInnerText: true }, // Prevents words from sticking to each other
  );

  await expect(
    blockRegionLocator.locator("p").nth(0).locator("strong"),
  ).toContainText("bold");

  await expect(
    blockRegionLocator.locator("p").nth(0).locator("em"),
  ).toContainText("italics");

  await expect(blockRegionLocator.locator("p").nth(1)).toContainText(
    "Second paragraph\n\nwith\nline breaks",
    { useInnerText: true },
  );

  await expect(blockRegionLocator.locator("hr")).toBeVisible();

  await expect(
    blockRegionLocator.locator('[data-testid="block-handle"]'),
  ).toHaveCount(5);
});

test("user can rename page", async ({ page }) => {
  const pageName1 = `Page ${pageNameSuffix}`;
  const pageName2 = `Page 2 ${pageNameSuffix}`;

  await loginUsingUi({ page, accountShortName: "alice" });
  await page.click(`text=${pageNameFallback}`);
  await page.waitForURL((url) => !!url.pathname.match(/^\/[\w-]+\/[\w-]+$/));

  const listOfPagesLocator = page.locator(listOfPagesSelector);
  const pageTitleLocator = page.locator(pageTitleInputSelector);

  // Change page name (using Enter)
  await pageTitleLocator.fill(pageName2);
  await pageTitleLocator.press("Enter");
  await expect(pageTitleLocator).toBeEnabled();
  await expect(listOfPagesLocator).toContainText(pageName2);

  // Revert page name change (using Tab)
  await sleep(500); // TODO: Investigate why delay is required for <PageTitle /> state to work
  await pageTitleLocator.fill(pageName1);
  await pageTitleLocator.press("Tab");
  await expect(listOfPagesLocator).toContainText(pageName1);

  // Change page name (by clicking outside)
  await sleep(500); // TODO: Investigate why delay is required for <PageTitle /> state to work
  await pageTitleLocator.fill(pageName2);
  await page.click("main");
  await expect(listOfPagesLocator).toContainText(pageName2);

  // Revert page name change (using Esc)
  await sleep(500); // TODO: Investigate why delay is required for <PageTitle /> state to work
  await pageTitleLocator.fill(pageName1);
  await pageTitleLocator.press("Escape");
  await expect(listOfPagesLocator).not.toContainText(pageName2);
  await expect(listOfPagesLocator).toContainText(pageName1);
});
