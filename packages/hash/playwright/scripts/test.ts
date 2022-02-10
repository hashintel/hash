import { sleep } from "@hashintel/hash-shared/sleep";
import { firefox } from "@recordreplay/playwright";
import { getDerivedPayloadFromMostRecentEmail } from "../tests/utils/getDerivedPayloadFromMostRecentEmail";

const extracted = async function (page: any, modifierKey: string) {
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

  // await dividerLoading;
  // await blockRegionLocator.locator("hr").waitFor({ state: "visible" });

  //
  // // Wait for divider block to load
  // await expect(blockRegionLocator).not.toContainText("Loading...", {
  //   timeout: 10000,
  // });
  // await expect(blockRegionLocator.locator("hr")).toBeVisible();
  //
  // // TODO: Move the cursor below the new divider and update the test?
  //

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
};
(async () => {
  const browser = await firefox.launch({ headless: false });
  const page = await browser.newPage();

  // Go to http://localhost:3000/login
  await page.goto("http://localhost:3000/login");

  // Click [placeholder="Enter\ your\ email\ or\ shortname"]
  await page.click('[placeholder="Enter\\ your\\ email\\ or\\ shortname"]');

  // Fill [placeholder="Enter\ your\ email\ or\ shortname"]
  await page.fill(
    '[placeholder="Enter\\ your\\ email\\ or\\ shortname"]',
    "alice",
  );

  const emailDispatchTimestamp = Date.now();

  // Press Enter
  await page.press(
    '[placeholder="Enter\\ your\\ email\\ or\\ shortname"]',
    "Enter",
  );

  // Enter verification code
  const verificationCodeInputSelector = '[data-testid="verify-code-input"]';

  await page.fill(
    verificationCodeInputSelector,
    (
      await getDerivedPayloadFromMostRecentEmail(emailDispatchTimestamp)
    ).verificationCode as string,
  );
  // Fill [data-testid="verify-code-input"]
  await Promise.all([
    page.waitForNavigation(/* { url: 'http://localhost:3000/2e133a1c-969a-413c-aabb-41cf2d36178f' } */),
    await page.press(verificationCodeInputSelector, "Enter"),
  ]);

  // Click text=Create page
  await page.click("text=Create page");

  // Fill [placeholder="What\ is\ this\ document\?"]
  await page.fill(
    '[placeholder="What\\ is\\ this\\ document\\?"]',
    `test page ${Math.floor(Math.random() * 10000)}`,
  );

  // Press Enter
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }),
    page.press('[placeholder="What\\ is\\ this\\ document\\?"]', "Enter"),
  ]);

  const modifierKey = process.platform === "darwin" ? "Meta" : "Control";
  await page.waitForSelector('#root [data-testid="block-handle"]');

  //
  // // Wait for ProseMirror to load
  // // TODO: investigate why page renaming before block loading is unstable
  // await expect(
  //   blockRegionLocator.locator('[data-testid="block-handle"]'),
  // ).toHaveCount(1);
  // await expect(listOfPagesLocator).toContainText(pageName);

  // Type in a paragraph block
  await (
    await page.waitForSelector('#root [data-testid="block-handle"] p div')
  ).click();

  for (let i = 0; i < 10; i++) {
    await extracted(page, modifierKey);
    await page.keyboard.press("Enter");
    await sleep(1_000); // TODO: investigate flakiness in FF and Webkit
  }

  await sleep(10_000);

  //
  // // Expect just inserted content to be present on the page
  // await expect(blockRegionLocator).toContainText(
  //   "My test paragraph with bold and italics",
  //   // "My test paragraph with bold and italics\nSecond paragraph\nwith\nline breaks",
  //   { useInnerText: true }, // Prevents words from sticking to each other
  // );
  //
  // // Check number of blocks
  // await expect(
  //   blockRegionLocator.locator('[data-testid="block-handle"]'),
  // ).toHaveCount(3);
  //
  // // Give collab some time to sync data
  // await sleep(2000);
  //
  // // Check content stability after page reload
  // await page.reload();
  //
  // await expect(pageTitleLocator).toHaveValue(pageName);
  //
  // await expect(blockRegionLocator.locator("p").nth(0)).toContainText(
  //   "My test paragraph with bold and italics",
  //   { useInnerText: true }, // Prevents words from sticking to each other
  // );
  //
  // await expect(
  //   blockRegionLocator.locator("p").nth(0).locator("strong"),
  // ).toContainText("bold");
  //
  // await expect(
  //   blockRegionLocator.locator("p").nth(0).locator("em"),
  // ).toContainText("italics");
  //
  // await expect(blockRegionLocator.locator("p").nth(1)).toContainText(
  //   "Second paragraph\n\nwith\nline breaks",
  //   { useInnerText: true },
  // );
  //
  // await expect(blockRegionLocator.locator("hr")).toBeVisible();
  //
  // await expect(
  //   blockRegionLocator.locator('[data-testid="block-handle"]'),
  // ).toHaveCount(3);

  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
