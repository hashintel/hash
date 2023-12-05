import { customColors } from "@hashintel/design-system/theme";
import browser from "webextension-polyfill";

export const clearBadge = () => {
  void browser.action.setBadgeText({ text: "" });
};

const badgeIsNumber = async () => {
  const currentBadgeText = await browser.action.getBadgeText({});
  return !Number.isNaN(parseInt(currentBadgeText, 10));
};

export const clearNotifications = async () => {
  const badgeIsANumber = await badgeIsNumber();
  if (badgeIsANumber) {
    clearBadge();
  }
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
  const badgeIsANumber = await badgeIsNumber();

  const currentBadgeNum = badgeIsANumber
    ? parseInt(await browser.action.getBadgeText({}), 10)
    : 0;

  void browser.action.setBadgeBackgroundColor({ color: customColors.lime[70] });
  void browser.action.setBadgeText({
    text: (currentBadgeNum + increment).toString(),
  });
  browser.action.setBadgeTextColor({ color: "white" });
};
