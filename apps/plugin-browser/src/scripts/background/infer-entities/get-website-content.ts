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

    const pageDetails = await (browser.tabs.sendMessage(tab.id, {
      html: true,
      type: "get-tab-content",
    } satisfies GetTabContentRequest) as Promise<GetTabContentReturn>);

    webPages.push({
      url: pageDetails.pageUrl,
      title: pageDetails.pageTitle,
      htmlContent: pageDetails.content,
    });

    await browser.tabs.remove(tab.id);
  }

  await new Promise((resolve) => {
    setTimeout(resolve, 10_000);
  });

  if (window.id) {
    void browser.windows.remove(window.id);
  }

  return webPages;
};
