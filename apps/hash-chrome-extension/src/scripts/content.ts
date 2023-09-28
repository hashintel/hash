/**
 * Content scripts operate in the context of the webpage itself, for reading and manipulating context.
 *
 * They have access to a limited set of Chrome extension APIs
 * @see https://developer.chrome.com/docs/extensions/mv3/content_scripts/
 *
 * The relevant window is the web page itself, e.g. any logs will appear in the web page's console.
 *
 * You must click 'Update' in chrome://extensions if you modify this file.
 */

import { Message } from "../shared/messages";

console.log("Content script loaded");

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
    if (message.type === "get-site-content") {
      const docContent =
        document.querySelector("main") || document.querySelector("body");

      sendResponse(docContent?.innerText);
      return;
    }

    sendResponse(`Unrecognised message type ${message.type}`);
  },
);
