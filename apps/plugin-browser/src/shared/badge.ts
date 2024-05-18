import browser from "webextension-polyfill";

import { getFromLocalStorage } from "./storage";

const isTestBedBuild = !!ITERO_TEST_BED;

const generateIconPath = (
  status: "default" | "disabled" | "enabled" | "warning" | "error" | "success",
) => `/${status}-48${isTestBedBuild ? "-dev" : ""}.png`;

export const clearError = async () => {
  const inferenceConfig = await getFromLocalStorage("automaticInferenceConfig");

  void browser.action.setIcon({
    path: generateIconPath(inferenceConfig?.enabled ? "enabled" : "disabled"),
  });
};

export const setDisabledBadge = () => {
  void browser.action.setIcon({ path: generateIconPath("disabled") });
};

export const setEnabledBadge = () => {
  void browser.action.setIcon({ path: generateIconPath("enabled") });
};

export const setErroredBadge = () => {
  void browser.action.setIcon({ path: generateIconPath("warning") });
};
