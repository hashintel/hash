import browser from "webextension-polyfill";

import type { Message } from "../../shared/messages";

export const sendMessageToBackground = (message: Message) => {
  return browser.runtime.sendMessage(message);
};
