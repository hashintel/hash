import type { WebPage } from "@local/hash-isomorphic-utils/flows/types";
import puppeteer from "puppeteer";

export const getWebPageActivity = async (params: {
  url: string;
}): Promise<WebPage> => {
  const { url } = params;

  /** @todo: consider re-using the same `browser` instance across requests  */
  const browser = await puppeteer.launch();

  const page = await browser.newPage();

  await page.goto(url, {
    // waits until the network is idle (no more than 2 network connections for at least 500 ms)
    waitUntil: "networkidle2",
  });

  /**
   * We use puppeteer because we want to obtain the `innerText` of the HTML body.
   *
   * Ideally we'd use a lighter weight approach via a package such as `jsdom`,
   * but `innerText` remains unavailable in this package (@see https://github.com/jsdom/jsdom/issues/1245)
   */
  const innerText = await page.evaluate(() => document.body.innerText);

  const title = await page.title();

  await browser.close();

  return {
    title,
    url,
    textContent: innerText,
  };
};
