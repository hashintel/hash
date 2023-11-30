import { customColors } from "@hashintel/design-system/theme";
import browser from "webextension-polyfill";

export const clearBadge = () => {
  void browser.action.setBadgeText({ text: "" });
};

export const setLoadingBadge = () => {
  void browser.action.setBadgeText({ text: "💭" });
  void browser.action.setBadgeBackgroundColor({ color: customColors.blue[80] });
};

export const setErroredBadge = () => {
  void browser.action.setBadgeText({ text: "❌" });
  void browser.action.setBadgeBackgroundColor({ color: "black" });
};

export const setSuccessBadge = async (increment: number) => {
  const currentBadgeText = await browser.action.getBadgeText({});

  const currentBadgeAsInt = parseInt(currentBadgeText, 10);

  const currentBadgeNum = Number.isNaN(currentBadgeAsInt)
    ? 0
    : currentBadgeAsInt;

  void browser.action.setBadgeBackgroundColor({ color: customColors.lime[70] });
  void browser.action.setBadgeText({
    text: (currentBadgeNum + increment).toString(),
  });
  browser.action.setBadgeTextColor({ color: "white" });
};
