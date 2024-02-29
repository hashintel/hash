import puppeteer from "puppeteer";

export const getTextFromWebPage = async (params: { url: string }) => {
  const { url } = params;

  /** @todo: consider re-using the same `browser` instance across requests  */
  const browser = await puppeteer.launch();

  const page = await browser.newPage();

  await page.goto(url);

  /**
   * We use puppeteer because we want to obtain the `innerText` of the HTML body.
   *
   * Ideally we'd use a lighter weight approach via a package such as `jsdom`,
   * but `innerText` remains unavailable in this package (@see https://github.com/jsdom/jsdom/issues/1245)
   */
  const innerText = await page.evaluate(() => document.body.innerText);

  await browser.close();

  return innerText;
};
