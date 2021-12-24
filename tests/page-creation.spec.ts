import { test, expect } from "@playwright/test";
import { loginUsingUi } from "./utils/loginUsingUi";
import sleep from "sleep-promise";

// TODO: Remove dynamic page suffix when we start seeding the DB before each test
// Partially blocked by https://github.com/hashintel/dev/pull/379
const pageNameSuffix = Date.now();
const pageName = `Test page ${pageNameSuffix}`;

const listOfPagesSelector = 'nav header:has-text("Pages")';
const pageTitleInputSelector = '[placeholder="A title for the page"]';

// TODO: Revert after https://github.com/hashintel/dev/pull/432 is merged
test("user can create page", async ({ page }) => {
  await loginUsingUi({ page, accountShortName: "alice" });

  // Check if we are on the user page
  await expect(
    page.locator(
      "text=Please select a page from the list, or create a new page.",
    ),
  ).toBeVisible();

  // TODO: Make sure account dropdown shows the current account

  // TODO: Check URL contains own login once we have replaced uuids implemented
  await page.waitForURL((url) => !!url.pathname.match(/^\/[\w-]+$/));

  // Create the new page
  await page.click("text=Create page");
  await page.type('[placeholder="What is this document?"]', pageName);

  await page.click('div[role="dialog"] >> text=Create');

  await page.waitForURL((url) => !!url.pathname.match(/^\/[\w-]+\/[\w-]+$/));

  await expect(page.locator(pageTitleInputSelector)).toHaveValue(pageName);

  const blockRegionLocator = page.locator("#root");
  const listOfPagesLocator = page.locator(listOfPagesSelector);
  const pageTitleLocator = page.locator(pageTitleInputSelector);

  // Wait for ProseMirror to load
  // TODO: investigate why page renaming before block loading is unstable
  await expect(
    blockRegionLocator.locator('[data-testid="block-handle"]'),
  ).toHaveCount(1);
  await expect(listOfPagesLocator).toContainText(pageName);

  // Type in a paragraph block
  await blockRegionLocator.locator("p div").click();
  await page.keyboard.type("My test paragraph with ");
  await page.keyboard.press("Meta+b");
  await page.keyboard.type("bold");
  await page.keyboard.press("Meta+b");
  await page.keyboard.type(" and ");
  await page.keyboard.press("Meta+i");
  await page.keyboard.type("italics");
  await page.keyboard.press("Meta+i");

  // Insert a divider
  await page.keyboard.press("Enter");
  await sleep(100); // TODO: investigate flakiness in FF and Webkit
  await page.keyboard.type("/divider");
  await page.keyboard.press("Enter");
  await sleep(100); // TODO: investigate flakiness in FF and Webkit

  // Wait for divider block to load
  await expect(blockRegionLocator).not.toContainText("Loading...", {
    timeout: 10000,
  });
  await expect(blockRegionLocator.locator("hr")).toBeVisible();

  // TODO: Move the cursor below the new divider and update the test?

  // Insert a paragraph creation with newlines
  // TODO: Enable and fix by updating ProseMirror code
  // await page.keyboard.type("Second paragraph");
  // await page.keyboard.press("Shift+Enter");
  // await sleep(100); // TODO: investigate flakiness in FF and Webkit
  // await page.keyboard.press("Shift+Enter");
  // await sleep(100); // TODO: investigate flakiness in FF and Webkit
  // await page.keyboard.type("with");
  // await page.keyboard.press("Shift+Enter");
  // await sleep(100); // TODO: investigate flakiness in FF and Webkit
  // await page.keyboard.type("line breaks");

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

  // Give collab some time to sync data
  await sleep(2000);

  // Check content stability after page reload
  await page.reload();

  await expect(pageTitleLocator).toHaveValue(pageName);

  await expect(blockRegionLocator).toContainText(
    "My test paragraph with bold and italics",
    // "My test paragraph with bold and italics\nSecond paragraph\nwith\nline breaks",
    { useInnerText: true }, // Prevents words from sticking to each other
  );

  await expect(blockRegionLocator.locator("hr")).toBeVisible();

  await expect(
    blockRegionLocator.locator('[data-testid="block-handle"]'),
  ).toHaveCount(3);
});

// TODO: investigate flakiness of page renaming and enable the test in CI
test.skip("user can rename page", async ({ page }) => {
  const changedPageName = `Renamed test page ${pageNameSuffix}`;

  await loginUsingUi({ page, accountShortName: "alice" });
  await page.click(`text=${pageName}`);
  await page.waitForURL((url) => !!url.pathname.match(/^\/[\w-]+\/[\w-]+$/));

  const listOfPagesLocator = page.locator(listOfPagesSelector);
  const pageTitleLocator = page.locator(pageTitleInputSelector);

  // Change page name (using Enter)
  await pageTitleLocator.fill(changedPageName);
  await pageTitleLocator.press("Enter");
  await expect(pageTitleLocator).toBeEnabled();
  await expect(listOfPagesLocator).not.toContainText(pageName);
  await expect(listOfPagesLocator).toContainText(changedPageName);

  // Revert page name change (using Tab)
  await sleep(500); // TODO: Investigate why delay is required for <PageTitle /> state to work
  await pageTitleLocator.fill(pageName);
  await pageTitleLocator.press("Tab");
  await expect(listOfPagesLocator).not.toContainText(changedPageName);
  await expect(listOfPagesLocator).toContainText(pageName);

  // Change page name (by clicking outside)
  await sleep(500); // TODO: Investigate why delay is required for <PageTitle /> state to work
  await pageTitleLocator.fill(changedPageName);
  await page.click("main");
  await expect(listOfPagesLocator).not.toContainText(pageName);
  await expect(listOfPagesLocator).toContainText(changedPageName);

  // Revert page name change (using Esc)
  await sleep(500); // TODO: Investigate why delay is required for <PageTitle /> state to work
  await pageTitleLocator.fill(pageName);
  await pageTitleLocator.press("Escape");
  await expect(listOfPagesLocator).not.toContainText(changedPageName);
  await expect(listOfPagesLocator).toContainText(pageName);
});
