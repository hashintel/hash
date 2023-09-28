/**
 * This is the service worker for the extension. You must click 'Update' in chrome://extensions if you modify it.
 *
 * @see https://developer.chrome.com/docs/extensions/mv3/service_workers/events/
 *
 * You must click 'inspect views' in chrome://extensions to see console logs etc from this file.
 */

console.log("Background script run");

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") {
    // Open the options page when the extension is first installed
    void chrome.tabs.create({
      url: "options.html",
    });
  }
});
