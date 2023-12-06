import * as domain from "node:domain";

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
    getFromLocalStorage("automaticInferenceConfig")
      .then(async (automaticInferenceConfig) => {
        if (automaticInferenceConfig?.enabled) {
          const pageDetails = await (browser.tabs.sendMessage(tabId, {
            type: "get-site-content",
          } satisfies GetSiteContentRequest) as Promise<GetSiteContentReturn>);

          const applicableRules = automaticInferenceConfig.rules.filter(
            ({ restrictToDomains }) => {
              const pageHostname = new URL(pageDetails.pageUrl).hostname;
              return (
                restrictToDomains.length === 0 ||
                restrictToDomains.some(
                  (domainToMatch) =>
                    pageHostname === domainToMatch ||
                    pageHostname.endsWith(`.${domainToMatch}`),
                )
              );
            },
          );

          if (applicableRules.length === 0) {
            return;
          }

          const entityTypeIdsToInfer = applicableRules.map(
            ({ entityTypeId }) => entityTypeId,
          );

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
              createAs: automaticInferenceConfig.createAs,
              entityTypeIds: entityTypeIdsToInfer,
              ownedById: automaticInferenceConfig.ownedById,
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
        console.error(`Automatic inference error: ${(err as Error).message}`);
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

const tenMinutesInMs = 10 * 60 * 1000;

const setInferenceRequests = getSetFromLocalStorageValue("inferenceRequests");
void setInferenceRequests((currentValue) =>
  (currentValue ?? []).map((request) => {
    if (request.status === "pending") {
      const now = new Date();
      const requestDate = new Date(request.createdAt);
      const msSinceRequest = now.getTime() - requestDate.getTime();

      if (msSinceRequest > tenMinutesInMs) {
        return {
          ...request,
          errorMessage: "Request timed out",
          status: "error",
        };
      }
    }

    return request;
  }),
);
