import type { Url } from "@blockprotocol/type-system";
import { validateExternalUrlWithDnsCheck } from "@local/hash-backend-utils/url-validation";
import type {
  FlowInternetAccessSettings,
  WebPage,
} from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { stringifyError } from "@local/hash-isomorphic-utils/stringify-error";
import { Context } from "@temporalio/activity";
import { JSDOM } from "jsdom";
import _puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import sanitizeHtml from "sanitize-html";

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
  const document = dom.window.document;

  const elements = document.querySelectorAll(
    disallowedTagsWithNoRelevantAttributes.join(","),
  );

  for (const element of elements) {
    if (!element.attributes.length) {
      while (element.firstChild) {
        element.parentNode?.insertBefore(element.firstChild, element);
      }
      element.remove();
    }
  }

  let sanitizedHtmlWithNoDisallowedTags = document.body.innerHTML
    // Remove any whitespace between tags
    .replace(/>\s+</g, "><")
    .trim();

  /**
   * Cut repeated newlines and tabs to a maximum of 2.
   */
  sanitizedHtmlWithNoDisallowedTags = sanitizedHtmlWithNoDisallowedTags.replace(
    /\n{3,}/g,
    "\n\n",
  );
  sanitizedHtmlWithNoDisallowedTags = sanitizedHtmlWithNoDisallowedTags.replace(
    /\t{3,}$/g,
    "\t\t",
  );

  const slicedSanitizedHtml = sliceContentForLlmConsumption({
    content: sanitizedHtmlWithNoDisallowedTags,
    maximumNumberOfTokens,
  });

  return slicedSanitizedHtml;
};

const getWebPageFromPuppeteer = async (
  url: Url,
): Promise<WebPage | { error: string }> => {
  /** @todo: consider re-using the same `browser` instance across requests  */
  const browser = await puppeteer.launch({
    args: ["--lang=en-US", "--no-sandbox", "--disable-dev-shm-usage"],
  });

  const page = await browser.newPage();

  await page.setExtraHTTPHeaders({
    /** @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Language */
    "Accept-Language": "en-US,en,q=0.5",
  });

  try {
    const { htmlContent, innerText } = await page
      .goto(url, {
        waitUntil: "networkidle2",
        timeout: 20_000,
      })
      .then((response) => {
        if (!response) {
          throw new Error("No response");
        }

        if (response.status() < 200 || response.status() >= 300) {
          throw new Error(`${response.status()}: ${response.statusText()}`);
        }
      })
      .then(async () => ({
        htmlContent: await page.evaluate(() => document.body.innerHTML),
        innerText: await page.evaluate(() => document.body.innerText),
      }));

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

    const errMessage = stringifyError(error);
    logger.error(`Failed to load URL ${url} in Puppeteer: ${errMessage}`);

    return {
      error: errMessage,
    };
  }
};

const getWebPageFromBrowser = async (
  url: Url,
): Promise<WebPage | { error: string }> => {
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

export const getWebPageActivity = async (params: {
  url: Url;
  sanitizeForLlm?: boolean;
}): Promise<WebPage | { error: string }> => {
  const { sanitizeForLlm, url } = params;

  const validationResult = await validateExternalUrlWithDnsCheck(url);
  if (!validationResult.valid) {
    const errorMsg = `URL rejected by validation in getWebPageActivity: ${validationResult.reason}`;
    logger.error(errorMsg);
    return { error: errorMsg };
  }
  const urlObject = validationResult.url;

  /**
   * We also use this function directly in sanitize-html.ts, where we don't have access to the Flow context.
   * We can bypass the requirement here if it's unavailable.
   */
  let browserPluginSettings: FlowInternetAccessSettings["browserPlugin"];
  try {
    const {
      dataSources: {
        internetAccess: { browserPlugin },
      },
    } = await getFlowContext();
    browserPluginSettings = browserPlugin;
  } catch {
    browserPluginSettings = {
      enabled: false,
      domains: [],
    };
  }

  const shouldAskBrowser =
    browserPluginSettings.enabled &&
    (browserPluginSettings.domains.includes(urlObject.host) ||
      browserPluginSettings.domains.some((domain) =>
        urlObject.host.endsWith(`.${domain}`),
      )) &&
    /**
     * @todo: find way to mock the temporal context to allow for accessing the
     * browser plugin in tests.
     */
    process.env.NODE_ENV !== "test";

  const response = shouldAskBrowser
    ? await getWebPageFromBrowser(url)
    : await getWebPageFromPuppeteer(url);

  if ("error" in response) {
    return response;
  }

  const { htmlContent, innerText, title } = response;

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
