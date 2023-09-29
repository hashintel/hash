import browser from "webextension-polyfill";

/**
 * This is the service worker for the extension. You must click 'Update' on the extension if you modify it.
 *
 * @see https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts
 *
 * You must click 'inspect views' in chrome://extensions to see console logs etc from this file.
 */

console.log("Background script run");

browser.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") {
    // Open the options page when the extension is first installed
    void browser.tabs.create({
      url: "options.html",
    });
  }
});
