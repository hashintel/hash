import browser from "webextension-polyfill";

import { Message } from "../../shared/messages";

export const sendMessageToBackground = (message: Message) => {
  return browser.runtime.sendMessage(message);
};
