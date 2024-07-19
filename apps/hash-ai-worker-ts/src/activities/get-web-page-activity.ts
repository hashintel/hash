import { JSDOM } from "jsdom";
import _puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import sanitizeHtml from "sanitize-html";
import type { WebPage } from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { Context } from "@temporalio/activity";

import { logger } from "./shared/activity-logger.js";
import { getFlowContext } from "./shared/get-flow-context.js";
import { requestExternalInput } from "./shared/request-external-input.js";

/** @see https://github.com/berstend/puppeteer-extra/issues/748 */
const puppeteer = _puppeteer.default;

puppeteer.use(StealthPlugin());

const sliceContentForLlmConsumption = (params: {
  content: string;
  maximumNumberOfTokens?: number;
}): string => {
  const { content, maximumNumberOfTokens = 75_000 } = params;

  const slicedContent = content.slice(
    0,
    /**
     * Assume that each token is 4 characters long.
     *
     * @todo: use `js-tiktoken` to more accurately determine the number of tokens.
     */
    maximumNumberOfTokens * 4,
  );

  return slicedContent;
};

/**
 * The attributes that will be allowed in the HTML content.
 */
const allowedAttributes = [
  "href",
  "src",
  "onclick",
  "title",
  "alt",
  "aria",
  "label",
  "aria-*",
  "data-*",
];

/**
 * The tags that will always be filtered from the HTML content.
 *
 * @todo: consider whether there are other tags that aren't relevant
 * for LLM consumption.
 */
const disallowedTags = ["script", "style", "link", "canvas", "svg"];

/**
 * The tags that will be filtered from the HTML content if they don't have
 * any of the relevant attributes (defined in `allowedAttributes`).
 */
const disallowedTagsWithNoRelevantAttributes = [
  "div",
  "span",
  "strong",
  "b",
  "i",
  "em",
];

export const sanitizeHtmlForLlmConsumption = (params: {
  htmlContent: string;
  maximumNumberOfTokens?: number;
}): string => {
  const { htmlContent, maximumNumberOfTokens } = params;

  const sanitizedHtml = sanitizeHtml(htmlContent, {
    allowedTags: sanitizeHtml.defaults.allowedTags.filter(
      (tag) => !disallowedTags.includes(tag),
    ),
    allowedAttributes: { "*": allowedAttributes },
    disallowedTagsMode: "discard",
  });

  const dom = new JSDOM(sanitizedHtml);
  const {document} = dom.window;

  const elements = document.querySelectorAll(
    disallowedTagsWithNoRelevantAttributes.join(","),
  );

  for (const element of elements) {
    if (element.attributes.length === 0) {
      while (element.firstChild) {
        element.parentNode?.insertBefore(element.firstChild, element);
      }
      element.remove();
    }
  }

  const sanitizedHtmlWithNoDisallowedTags = document.body.innerHTML
    // Remove any whitespace between tags
    .replaceAll(/>\s+</g, "><")
    .trim();

  const slicedSanitizedHtml = sliceContentForLlmConsumption({
    content: sanitizedHtmlWithNoDisallowedTags,
    maximumNumberOfTokens,
  });

  return slicedSanitizedHtml;
};

const getWebPageFromPuppeteer = async (url: string): Promise<WebPage> => {
  /** @todo: consider re-using the same `browser` instance across requests  */
  const browser = await puppeteer.launch({
    args: ["--lang=en-US"],
  });

  const page = await browser.newPage();

  await page.setExtraHTTPHeaders({
    /** @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Language */
    "Accept-Language": "en-US,en,q=0.5",
  });

  try {
    const timeout = 10_000;

    const navigationPromise = page.goto(url, {
      waitUntil: "networkidle2",
      timeout: timeout + 10_000,
    });

    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => { resolve(undefined); }, timeout);
    });

    /**
     * Obtain the `innerHTML` of the page, whether or
     * not it has finished loading after the timeout. This means
     * that for web pages with a significant amount of content,
     * we are still able to return a partial result.
     */
    const { htmlContent, innerText } = await Promise.race([
      navigationPromise,
      timeoutPromise,
    ]).then(async () => ({
      htmlContent: await page.evaluate(() => document.body.innerHTML),
      innerText: await page.evaluate(() => document.body.innerText),
    })); // Return partial content if timeout occurs

    const title = await page.title();

    await browser.close();

    return {
      htmlContent,
      innerText,
      title,
      url,
    };
  } catch (error) {
    await browser.close();

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const errorMessage = (error as Error).message ?? "Unknown error";

    logger.error(`Failed to load URL ${url} in Puppeteer: ${errorMessage}`);

    return {
      /**
       * @todo H-2604 consider returning this as a structured error that the calling code rather than the LLM can handle.
       */
      htmlContent: `Could not load page: ${errorMessage}`,
      innerText: `Could not load page: ${errorMessage}`,
      title: `Error loading page: ${errorMessage}`,
      url,
    };
  }
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
    return getWebPageFromPuppeteer(url);
  }

  return webPage;
};

export const getWebPageActivity = async (params: {
  url: string;
  sanitizeForLlm?: boolean;
}): Promise<WebPage | { error: string }> => {
  const { sanitizeForLlm, url } = params;

  let urlObject: URL;

  try {
    urlObject = new URL(url);
  } catch {
    const errorMessage = `Invalid URL provided to getWebPageActivity: ${url}`;

    logger.error(errorMessage);

    return { error: errorMessage };
  }

  const {
    dataSources: {
      internetAccess: { browserPlugin },
    },
  } = await getFlowContext();

  const shouldAskBrowser =
    browserPlugin.enabled &&
    (browserPlugin.domains.includes(urlObject.host) ||
      browserPlugin.domains.some((domain) =>
        urlObject.host.endsWith(`.${domain}`),
      )) &&
    /**
     * @todo: find way to mock the temporal context to allow for accessing the
     * browser plugin in tests.
     */
    process.env.NODE_ENV !== "test";

  const { htmlContent, innerText, title } = shouldAskBrowser
    ? await getWebPageFromBrowser(url)
    : await getWebPageFromPuppeteer(url);

  if (sanitizeForLlm) {
    const sanitizedHtml = sanitizeHtmlForLlmConsumption({ htmlContent });
    const sanitizedInnerText = sliceContentForLlmConsumption({
      content: innerText,
    });

    return {
      htmlContent: sanitizedHtml,
      innerText: sanitizedInnerText,
      title,
      url,
    };
  }

  return {
    title,
    url,
    htmlContent,
    innerText,
  };
};
