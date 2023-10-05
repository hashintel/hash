import browser from "webextension-polyfill";

/**
 * This is the service worker for the extension.
 *
 * @see https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts
 *
 * You must click 'inspect' in chrome://extensions or about:debugging#/runtime/this-firefox to see console logs etc from this file.
 *
 * You must update the extension if you amend this file, from the extensions manager page in the browser.
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

browser.action.setBadgeTextColor({ color: "#ffffff" });

const setLoadingBadge = () => {
  void browser.action.setBadgeText({ text: "💭" });
  void browser.action.setBadgeBackgroundColor({ color: "#006DC3" });
};

const setErroredBadge = () => {
  void browser.action.setBadgeText({ text: "❌" });
  void browser.action.setBadgeBackgroundColor({ color: "black" });
};

const setSuccessBadge = (num: number) => {
  void browser.action.setBadgeText({ text: num.toString() });
  void browser.action.setBadgeBackgroundColor({ color: "#9AC952" });
};

const clearBadge = () => {
  void browser.action.setBadgeText({ text: "" });
};
