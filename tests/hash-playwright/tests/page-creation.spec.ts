// import { blockProtocolHubOrigin } from "@local/hash-isomorphic-utils/blocks";
import { sleep } from "@local/hash-isomorphic-utils/sleep";

import { loginUsingTempForm } from "./shared/login-using-temp-form";
import { resetDb } from "./shared/reset-db";
import { expect, test } from "./shared/runtime";

const pageNameSuffix = Date.now();
const pageNameFallback = "Untitled";

const listOfPagesSelector = '[data-testid="pages-tree"]';
const pageTitleInputSelector = '[placeholder="Untitled"]';
const createPageButtonSelector = '[data-testid="create-page-btn"]';
const placeholderSelector =
  "text=Type / to browse blocks, or @ to browse entities";
const modifierKey = process.platform === "darwin" ? "Meta" : "Control";

test.beforeEach(async () => {
  await resetDb();
});

test("user can create page", async ({ page }) => {
  await loginUsingTempForm({ page });

  await page.waitForURL("/");
  await expect(page.locator("text=Welcome to HASH")).toBeVisible();

  // TODO: investigate why delay is required for create page button to work
  await sleep(500);
  await page.locator(createPageButtonSelector).click();

  await page.waitForURL((url) => !!url.pathname.match(/^\/@[\w-]+\/[\w-]+$/));

  const blockRegion = page.locator("#root");
  const listOfPages = page.locator(listOfPagesSelector);

  // Wait for ProseMirror to load
  // TODO: investigate why page renaming before block loading is unstable
  await expect(blockRegion.locator('[data-testid="block-handle"]')).toHaveCount(
    1,
  );
  await expect(listOfPages).toContainText(pageNameFallback);

  // Type in a paragraph block
  await expect(page.locator(placeholderSelector)).toBeVisible();
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
  await expect(blockRegion).not.toContainText("Loading...", {
    timeout: 10000,
  });
  await expect(blockRegion.locator("hr")).toBeVisible();

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
  await expect(blockRegion).toContainText(
    "My test paragraph with bold and italics",
    // "My test paragraph with bold and italics\nSecond paragraph\nwith\nline breaks",
    { useInnerText: true }, // Prevents words from sticking to each other
  );

  // Check number of blocks
  await expect(blockRegion.locator('[data-testid="block-handle"]')).toHaveCount(
    3,
  );

  await page.keyboard.press("Enter");
  await sleep(100); // TODO: investigate flakiness in FF and Webkit

  await expect(blockRegion.locator('[data-testid="block-handle"]')).toHaveCount(
    4,
  );

  const blockChanger = blockRegion
    .locator('[data-testid="block-changer"]')
    .nth(2);
  await blockChanger.click();

  /** @todo-0.3 - re-enable this once HASH and BP are in sync again and the code block is fixed */
  // const blockContextMenu = page.locator('[data-testid="block-context-menu"]');
  //
  // await blockContextMenu
  //   .locator('[placeholder="Load block from URL..."]')
  //   .fill(`${blockProtocolHubOrigin}/blocks/@hash/code`);
  //
  // /**
  //  * This is creating a new block above the current one, instead of switching
  //  * block. This is a bug, and results in us having one extra block than
  //  * intended, which impacts the rest of this test.
  //  *
  //  * @see https://app.asana.com/0/1201095311341924/1202033760322934/f
  //  */
  // await blockContextMenu.locator("text=Re-load block").click();
  //
  // await expect(
  //   blockContextMenu.locator('[placeholder="Load block from URL..."]'),
  // ).toHaveCount(0, { timeout: 2000 });
  //
  // await expect(
  //   blockRegion.locator(`[data-testid="block"]:nth-child(3) p`),
  // ).toHaveCount(0);
  //
  // Give collab some time to sync data
  await sleep(2000);

  // Check content stability after page reload
  await page.reload();

  const blocks = blockRegion.locator('[data-testid="block"]');
  await expect(blocks.nth(0)).toContainText(
    "My test paragraph with bold and italics",
    { useInnerText: true }, // Prevents words from sticking to each other
  );

  await expect(blocks.nth(0).locator("strong")).toContainText("bold");

  await expect(blocks.nth(0).locator("em")).toContainText("italics");

  await expect(blocks.nth(1)).toContainText(
    "Second paragraph\n\nwith\nline breaks",
    { useInnerText: true },
  );

  await expect(blockRegion.locator("hr")).toBeVisible();

  /** @todo-0.3 - re-enable this once HASH and BP are in sync again and the code block is fixed */
  // await expect(blockRegion.locator('[data-testid="block-handle"]')).toHaveCount(
  //   5,
  // );
});

test("user can rename page", async ({ page }) => {
  const pageName1 = `Page ${pageNameSuffix}`;
  const pageName2 = `Page 2 ${pageNameSuffix}`;

  await loginUsingTempForm({ page });

  // TODO: investigate why delay is required for create page button to work
  await sleep(500);
  await page.locator(createPageButtonSelector).click();

  await page.waitForURL((url) => !!url.pathname.match(/^\/@[\w-]+\/[\w-]+$/));

  const listOfPages = page.locator(listOfPagesSelector);
  const pageTitle = page.locator(pageTitleInputSelector);

  // Change page name (using Enter)
  await pageTitle.fill(pageName2);
  await pageTitle.press("Enter");
  await expect(pageTitle).toBeEnabled();
  await expect(listOfPages).toContainText(pageName2);

  // Revert page name change (using Tab)
  await sleep(500); // TODO: Investigate why delay is required for <PageTitle /> state to work
  await pageTitle.fill(pageName1);
  await pageTitle.press("Tab");
  await expect(listOfPages).toContainText(pageName1);

  // Change page name (by clicking outside)
  await sleep(500); // TODO: Investigate why delay is required for <PageTitle /> state to work
  await pageTitle.fill(pageName2);
  await page.click("main");
  await expect(listOfPages).toContainText(pageName2);

  // Revert page name change (using Esc)
  await sleep(500); // TODO: Investigate why delay is required for <PageTitle /> state to work
  await pageTitle.fill(pageName1);
  await pageTitle.press("Escape");
  await expect(listOfPages).not.toContainText(pageName2);
  await expect(listOfPages).toContainText(pageName1);
});
