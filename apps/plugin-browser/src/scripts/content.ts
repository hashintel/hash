import browser from "webextension-polyfill";

/**
 * Content scripts operate in the context of the webpage itself, for reading and manipulating context.
 *
 * They have access to a limited set of browser APIs
 * @see https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts
 *
 * The relevant window is the web page itself, e.g. any logs will appear in the web page's console.
 *
 * You must update the extension if you amend this file, from the extensions manager page in the browser.
 */
import { GetSiteContentReturn, Message } from "../shared/messages";

browser.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
    if (message.type === "get-site-content") {
      const docContent =
        document.querySelector("main") ?? document.querySelector("body");

      /**
       * Take the URL without any anchor hash on the assumption that it does not affect page content.
       * Helps avoid making duplicate requests for the same page.
       */
      const urlObject = new URL(window.location.href);
      const pageUrl = urlObject.href.replace(urlObject.hash, "");

      sendResponse({
        innerText: docContent?.innerText ?? "",
        pageTitle: document.title,
        pageUrl,
      } satisfies GetSiteContentReturn);
      return;
    }

    sendResponse(`Unrecognised message type ${message.type}`);
  },
);
