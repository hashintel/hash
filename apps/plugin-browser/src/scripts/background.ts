import browser from "webextension-polyfill";

import { getUser } from "../shared/get-user";
import {
  GetSiteContentRequest,
  GetSiteContentReturn,
  Message,
} from "../shared/messages";
import {
  clearLocalStorage,
  getFromLocalStorage,
  getSetFromLocalStorageValue,
  setInLocalStorage,
} from "../shared/storage";
import { inferEntities } from "./background/infer-entities";

/**
 * This is the service worker for the extension.
 *
 * @see https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts
 *
 * You must click 'inspect' in chrome://extensions or about:debugging#/runtime/this-firefox to see console logs etc from this file.
 *
 * You must update the extension if you amend this file, from the extensions manager page in the browser.
 */

browser.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") {
    // Open the options page when the extension is first installed
    void browser.tabs.create({
      url: "options.html",
    });
  }
});

browser.runtime.onMessage.addListener((message: Message, sender) => {
  if (sender.tab) {
    // We are not expecting any messages from the content script
    return;
  }

  if (message.type === "infer-entities") {
    void inferEntities(message, "user");
  }
});

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") {
    getFromLocalStorage("passiveInference")
      .then(async (passiveInference) => {
        if (passiveInference?.enabled) {
          const targetEntityTypes =
            await getFromLocalStorage("targetEntityTypes");

          if (!targetEntityTypes) {
            return;
          }

          const pageDetails = await (browser.tabs.sendMessage(tabId, {
            type: "get-site-content",
          } satisfies GetSiteContentRequest) as Promise<GetSiteContentReturn>);

          const inferenceRequests =
            await getFromLocalStorage("inferenceRequests");

          const pendingRequest = inferenceRequests?.find((request) => {
            return (
              request.sourceUrl === pageDetails.pageUrl &&
              request.status === "pending" &&
              request.trigger === "passive"
            );
          });

          if (pendingRequest) {
            return;
          }

          void inferEntities(
            {
              entityTypes: targetEntityTypes,
              sourceTitle: pageDetails.pageTitle,
              sourceUrl: pageDetails.pageUrl,
              textInput: pageDetails.innerText,
              type: "infer-entities",
            },
            "passive",
          );
        }
      })
      .catch((err) => {
        console.error(`Passive inference error: ${(err as Error).message}`);
      });
  }
});

void getUser().then((user) => {
  if (user) {
    void setInLocalStorage("user", user);
  } else {
    void clearLocalStorage();
  }
});

const setInferenceRequests = getSetFromLocalStorageValue("inferenceRequests");
void setInferenceRequests((currentValue) =>
  (currentValue ?? []).map((request) => {
    if (request.status === "pending") {
      return {
        ...request,
        errorMessage:
          "Request timed out or browser was closed while request was pending.",
        status: "error",
      };
    }

    return request;
  }),
);
