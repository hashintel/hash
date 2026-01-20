import type { EntityUuid } from "@blockprotocol/type-system";
import type {
  AutomaticInferenceWebsocketRequestMessage,
  CancelInferEntitiesWebsocketRequestMessage,
  CheckForExternalInputRequestsWebsocketRequestMessage,
  ExternalInputWebsocketResponseMessage,
  InferenceWebsocketServerMessage,
  ManualInferenceWebsocketRequestMessage,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import {
  automaticBrowserInferenceFlowDefinition,
  manualBrowserInferenceFlowDefinition,
} from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-definitions";
import type {
  AutomaticInferenceArguments,
  ManualInferenceArguments,
} from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-types";
import { sleep } from "@local/hash-isomorphic-utils/sleep";
import { v4 as uuid } from "uuid";
import browser from "webextension-polyfill";

import { FlowRunStatus } from "../../graphql/api-types.gen";
import type { InferEntitiesRequest } from "../../shared/messages";
import {
  getFromLocalStorage,
  getSetFromLocalStorageValue,
} from "../../shared/storage";
import { getWebsiteContent } from "./infer-entities/get-website-content";

const setExternalInputRequestsValue = getSetFromLocalStorageValue(
  "externalInputRequests",
);

const getCookieString = async () => {
  const apiOrigin = await getFromLocalStorage("apiOrigin");

  const cookies = await browser.cookies
    .getAll({
      url: apiOrigin ?? API_ORIGIN,
    })
    .then((options) =>
      options.filter(
        (option) =>
          option.name.startsWith("csrf_token_") ||
          option.name === "ory_kratos_session",
      ),
    );

  if (cookies.length < 2) {
    throw new Error("No session cookies available to use in websocket request");
  }

  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join(";");
};

const maxConcurrentRequests = 3;
const queue: (() => Promise<void>)[] = [];

let numberOfOutstandingInputRequests = 0;

const processQueue = async () => {
  console.log({ numberOfOutstandingInputRequests });

  if (numberOfOutstandingInputRequests >= maxConcurrentRequests) {
    return;
  }

  const task = queue.shift();
  if (!task) {
    return;
  }

  numberOfOutstandingInputRequests++;
  try {
    await task();
  } catch (err) {
    console.error("Task failed:", err);
  } finally {
    numberOfOutstandingInputRequests--;
  }

  void processQueue();
};

const enqueueTask = (task: () => Promise<void>) => {
  queue.push(task);
  void processQueue();
};

const waitForConnection = async (socket: WebSocket) => {
  while (socket.readyState !== socket.OPEN) {
    await sleep(200);
  }
};

let ws: WebSocket | null = null;
let reconnecting = false;

const createWebSocket = async ({ onClose }: { onClose: () => void }) => {
  const apiOrigin = await getFromLocalStorage("apiOrigin");

  const { host, protocol } = new URL(apiOrigin ?? API_ORIGIN);
  const websocketUrl = `${protocol === "https:" ? "wss" : "ws"}://${host}`;

  const newWs = new WebSocket(websocketUrl);

  const externalRequestPoll = setInterval(() => {
    void getCookieString().then((cookie) =>
      newWs.send(
        JSON.stringify({
          cookie,
          type: "check-for-external-input-requests",
        } satisfies CheckForExternalInputRequestsWebsocketRequestMessage),
      ),
    );
  }, 20_000);

  newWs.addEventListener("open", () => {
    console.log("Connection established");
  });

  newWs.addEventListener("close", () => {
    console.warn("WebSocket connection closed. Attempting to reconnect...");
    ws = null;

    clearInterval(externalRequestPoll);
    onClose();
  });

  newWs.addEventListener("error", () => {
    console.error(
      "WebSocket error encountered. Closing and attempting to reconnect...",
    );
    newWs.close();
  });

  newWs.addEventListener(
    "message",

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (event: MessageEvent<string>) => {
      const message = JSON.parse(event.data) as InferenceWebsocketServerMessage;

      const { workflowId, payload } = message;
      if (payload.type === "get-urls-html-content") {
        const inputRequests =
          (await getFromLocalStorage("externalInputRequests")) ?? {};

        const request = inputRequests[payload.requestId];

        if (request) {
          /**
           * This request is already being or has already been processed, so we don't need to do anything.
           */
          return;
        }

        await setExternalInputRequestsValue((requestsById) => ({
          ...requestsById,
          [payload.requestId]: {
            message,
            receivedAt: new Date().toISOString(),
          },
        }));

        /**
         * Limit the number of active requests to 3 to avoid overloading the browser.
         */
        enqueueTask(async () => {
          const webPages = await getWebsiteContent(payload.data.urls);

          const cookie = await getCookieString();

          newWs.send(
            JSON.stringify({
              cookie,
              workflowId,
              payload: {
                ...payload,
                data: { webPages: webPages ?? [] },
              },
              type: "external-input-response",
            } satisfies ExternalInputWebsocketResponseMessage),
          );

          /**
           * Clear the request from local storage after 30 seconds – if the message didn't get through to Temporal
           * for some reason, the API will request the content again.
           */
          setTimeout(() => {
            void setExternalInputRequestsValue((requestsById) => ({
              ...requestsById,
              [payload.requestId]: null,
            }));
          }, 30_000);
        });
      }
    },
  );

  return newWs;
};

const reconnectWebSocket = async () => {
  if (reconnecting || ws) {
    return;
  }

  reconnecting = true;

  try {
    console.log("Reconnecting WebSocket...");
    ws = await createWebSocket({ onClose: reconnectWebSocket });
    console.log("WebSocket reconnected successfully.");
  } catch (err) {
    console.error("Failed to reconnect WebSocket:", err);
    setTimeout(() => {
      void reconnectWebSocket();
    }, 3_000);
  } finally {
    if (ws) {
      reconnecting = false;
    }
  }
};

const getWebSocket = async () => {
  if (ws) {
    await waitForConnection(ws);
    return ws;
  }

  const newWs = await createWebSocket({ onClose: reconnectWebSocket });
  await waitForConnection(newWs);

  return newWs;
};

const sendInferEntitiesMessage = async (
  params:
    | {
        requestUuid: string;
        payload: AutomaticInferenceArguments;
        type: "automatic-inference-request";
      }
    | {
        requestUuid: string;
        payload: ManualInferenceArguments;
        type: "manual-inference-request";
      },
) => {
  const socket = await getWebSocket();

  const cookie = await getCookieString();

  socket.send(
    JSON.stringify({
      cookie,
      ...params,
    } satisfies
      | AutomaticInferenceWebsocketRequestMessage
      | ManualInferenceWebsocketRequestMessage),
  );
};

export const cancelInferEntities = async ({
  flowRunId,
}: {
  flowRunId: string;
}) => {
  const cookie = await getCookieString();

  const socket = await getWebSocket();

  socket.send(
    JSON.stringify({
      cookie,
      flowRunId,
      requestUuid: uuid(),
      type: "cancel-inference-request",
    } satisfies CancelInferEntitiesWebsocketRequestMessage),
  );
};

const setLocalPendingRuns = getSetFromLocalStorageValue("localPendingFlowRuns");

export const inferEntities = async (
  message: InferEntitiesRequest,
  trigger: "automatic" | "manual",
) => {
  const user = await getFromLocalStorage("user");
  if (!user) {
    throw new Error("Cannot infer entities without a logged-in user.");
  }

  const { createAs, entityTypeIds, model, webId, sourceWebPage } = message;

  const requestUuid = uuid() as EntityUuid;

  const basePayload = {
    webId,
    visitedWebPage: {
      kind: "WebPage",
      value: sourceWebPage,
    },
  } as const satisfies AutomaticInferenceArguments;

  const inferenceArgs =
    trigger === "automatic"
      ? ({
          payload: basePayload,
          requestUuid,
          type: "automatic-inference-request",
        } as const)
      : ({
          payload: {
            ...basePayload,
            draft: {
              kind: "Boolean",
              value: createAs === "draft",
            },
            entityTypeIds: {
              kind: "VersionedUrl",
              value: entityTypeIds,
            },
            model: {
              kind: "Text",
              value: model,
            },
          } as const satisfies ManualInferenceArguments,
          requestUuid,
          type: "manual-inference-request",
        } as const);

  await sendInferEntitiesMessage(inferenceArgs);

  const flowDefinition =
    trigger === "automatic"
      ? automaticBrowserInferenceFlowDefinition
      : manualBrowserInferenceFlowDefinition;

  /**
   * Optimistically add the run to local storage so that it appears in the history tab immediately.
   * When the next request for the latest runs comes back from the API, it will overwrite local storage again.
   */
  await setLocalPendingRuns((existingValue) => [
    ...(existingValue ?? []),
    {
      flowDefinitionId: flowDefinition.flowDefinitionId,
      flowRunId: requestUuid,
      closedAt: null,
      executedAt: new Date().toISOString(),
      persistedEntities: [],
      webId,
      inputRequests: [],
      inputs: [
        {
          dataSources: {
            internetAccess: {
              browserPlugin: {
                enabled: false,
                domains: [],
              },
              enabled: false,
            },
            files: {
              fileEntityIds: [],
            },
          },
          flowDefinition,
          flowType: "ai",
          flowTrigger: {
            triggerDefinitionId: flowDefinition.trigger.triggerDefinitionId,
            outputs: [],
          },
          webId,
        },
      ],
      webPage: basePayload.visitedWebPage.value,
      status: FlowRunStatus.Running,
    },
  ]);
};

/**
 * Keep a persist websocket connection because we use it to get sent input requests from the API
 */
const init = () => {
  void getWebSocket();
};

init();
