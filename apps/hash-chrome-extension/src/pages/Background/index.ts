console.log("HELLOOOO1 ");
chrome.action.onClicked.addListener((tab) => {
  console.log("HELLOOOO");
  chrome.scripting.executeScript({
    target: { tabId: tab.id ?? chrome.tabs.TAB_ID_NONE },
    files: ["content.bundle.js"],
  });
});
