import browser from "webextension-polyfill";

export const clearBadge = () => {
  void browser.action.setBadgeText({ text: "" });
};

export const setLoadingBadge = () => {
  void browser.action.setBadgeText({ text: "💭" });
  void browser.action.setBadgeBackgroundColor({ color: "#006DC3" });
};

export const setErroredBadge = () => {
  void browser.action.setBadgeText({ text: "❌" });
  void browser.action.setBadgeBackgroundColor({ color: "black" });
};

export const setSuccessBadge = (num: number) => {
  void browser.action.setBadgeBackgroundColor({ color: "#78B040" });
  void browser.action.setBadgeText({ text: num.toString() });
  browser.action.setBadgeTextColor({ color: "white" });
};
