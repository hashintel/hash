import type { WebPage } from "@local/hash-isomorphic-utils/flows/types";
import browser from "webextension-polyfill";

import type {
  GetTabContentRequest,
  GetTabContentReturn,
} from "../../../shared/messages";

export const getWebsiteContent = async (urls: string[]) => {
  const firstPage = urls[0];
  if (!firstPage) {
    return;
  }

  const window = await browser.windows.create({
    state: "minimized",
    url: [browser.runtime.getURL("/working.html")],
  });

  const webPages: WebPage[] = [];

  for (const url of urls) {
    const tab = await browser.tabs.create({
      active: false,
      url,
      windowId: window.id,
    });

    if (!tab.id) {
      console.error(`No tab created for url ${url}`);
      continue;
    }

    await new Promise<void>((resolve) => {
      const tabChangeListener = (
        tabId: number,
        changeInfo: browser.Tabs.OnUpdatedChangeInfoType,
      ) => {
        if (changeInfo.status === "complete" && tabId === tab.id) {
          browser.tabs.onUpdated.removeListener(tabChangeListener);
          resolve();
        }
      };

      browser.tabs.onUpdated.addListener(tabChangeListener);
    });

    const webPage = await browser.tabs.sendMessage<
      GetTabContentRequest,
      GetTabContentReturn
    >(tab.id, {
      type: "get-tab-content",
    });

    webPages.push(webPage);

    await browser.tabs.remove(tab.id);
  }

  if (window.id) {
    void browser.windows.remove(window.id);
  }

  return webPages;
};
