import type { WebPage } from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { Context } from "@temporalio/activity";
import puppeteer from "puppeteer";
import sanitizeHtml from "sanitize-html";

import { requestExternalInput } from "./shared/request-external-input";

const getWebPageFromPuppeteer = async (url: string): Promise<WebPage> => {
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
  const htmlContent = await page.evaluate(() => document.body.innerHTML);

  const title = await page.title();

  await browser.close();

  return {
    htmlContent,
    title,
    url,
  };
};

const getWebPageFromBrowser = async (url: string): Promise<WebPage> => {
  const externalResponse = await requestExternalInput({
    requestId: generateUuid(),
    stepId: Context.current().info.activityId,
    type: "get-urls-html-content",
    data: {
      urls: [url],
    },
  });

  const webPage = externalResponse.data.webPages[0];
  if (!webPage) {
    /** No webpage returned from external source, fallback to whatever Puppeteer can provide */
    return await getWebPageFromPuppeteer(url);
  }

  return webPage;
};

/**
 * Sites where the useful content is gated behind an authentication or paywall,
 * in which case we log a request for the content to be picked up by the user's browser.
 *
 * The user may not have access to these sites, and there may be unlisted sites we hit walls for
 * which the user _does_ have access to. The best solution would be some way of knowing which
 * sites specific user(s) can access.
 *
 * @todo vary these based on knowledge about which sites users can help us with
 */
const domainsToRequestFromBrowser = ["www.crunchbase.com", "www.linkedin.com"];

export const getWebPageActivity = async (params: {
  url: string;
  sanitizeForLlm?: boolean;
}): Promise<WebPage> => {
  const { sanitizeForLlm, url } = params;

  const urlObject = new URL(url);
  const shouldAskBrowser = domainsToRequestFromBrowser.includes(urlObject.host);

  const { htmlContent, title } = shouldAskBrowser
    ? await getWebPageFromBrowser(url)
    : await getWebPageFromPuppeteer(url);

  if (sanitizeForLlm) {
    const sanitizedHtml = sanitizeHtml(htmlContent, {
      allowedTags: sanitizeHtml.defaults.allowedTags.filter(
        /**
         * @todo: consider whether there are other tags that aren't relevant
         * for LLM consumption.
         */
        (tag) => !["script", "style", "link", "canvas", "svg"].includes(tag),
      ),
      allowedAttributes: {
        "*": [
          "href",
          "src",
          "onclick",
          "title",
          "alt",
          "aria",
          "label",
          "aria-*",
          "data-*",
        ],
      },
      disallowedTagsMode: "discard",
    });

    return { htmlContent: sanitizedHtml, title, url };
  }

  return {
    title,
    url,
    htmlContent,
  };
};
