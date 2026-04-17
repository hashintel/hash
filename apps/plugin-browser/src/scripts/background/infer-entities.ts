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

const getApiOriginUrl = async () => {
  const apiOrigin = await getFromLocalStorage("apiOrigin");
  return apiOrigin ?? API_ORIGIN;
};

const isLoggedIn = async (): Promise<boolean> => {
  const cookies = await browser.cookies.getAll({
    url: await getApiOriginUrl(),
    name: "ory_kratos_session",
  });
  return cookies.length > 0;
};

/** Build the cookie header for WebSocket requests (needs both CSRF and session). */
const buildWebsocketCookieString = async () => {
  const url = await getApiOriginUrl();
  const allCookies = await browser.cookies.getAll({ url });
  const relevant = allCookies.filter(
    (cookie) =>
      cookie.name.startsWith("csrf_token_") ||
      cookie.name === "ory_kratos_session",
  );

  if (relevant.length < 2) {
    throw new Error("No session cookies available to use in websocket request");
  }

  return relevant.map((cookie) => `${cookie.name}=${cookie.value}`).join(";");
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
  const timeout = 10_000;
  const start = Date.now();
  while (socket.readyState === socket.CONNECTING) {
    if (Date.now() - start > timeout) {
      throw new Error("WebSocket connection timed out");
    }
    await sleep(200);
  }
  if (socket.readyState !== socket.OPEN) {
    throw new Error(
      `WebSocket is ${socket.readyState === socket.CLOSING ? "closing" : "closed"}`,
    );
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
    void buildWebsocketCookieString()
      .then((cookie) =>
        newWs.send(
          JSON.stringify({
            cookie,
            type: "check-for-external-input-requests",
          } satisfies CheckForExternalInputRequestsWebsocketRequestMessage),
        ),
      )
      .catch(() => {
        // No session cookies — skip this poll tick.
      });
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

  newWs.addEventListener("error", (event) => {
    console.error(
      "WebSocket error encountered. Closing and attempting to reconnect...",
      event,
    );
    newWs.close();
  });

  newWs.addEventListener(
    "message",

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (event: MessageEvent<string>) => {
      let message: InferenceWebsocketServerMessage;
      try {
        message = JSON.parse(event.data) as InferenceWebsocketServerMessage;
      } catch {
        console.error("Malformed WebSocket message");
        return;
      }

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

          const cookie = await buildWebsocketCookieString();

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
    if (!(await isLoggedIn())) {
      // User isn't logged in — don't open a doomed connection that the
      // server will kill after 5 s. Retry later; a user action like
      // opening the popup will trigger getWebSocket() once cookies exist.
      return;
    }

    console.log("Reconnecting WebSocket...");
    ws = await createWebSocket({ onClose: reconnectWebSocket });
    console.log("WebSocket reconnected successfully.");
  } catch (err) {
    console.error("Failed to reconnect WebSocket:", err);
    setTimeout(() => {
      void reconnectWebSocket();
    }, 3_000);
  } finally {
    reconnecting = false;
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

  const cookie = await buildWebsocketCookieString();

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
  const cookie = await buildWebsocketCookieString();

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
 * Keep a persistent websocket connection because we use it to get sent
 * input requests from the API. If no session cookies are available yet
 * (user not logged in), defer until they appear so we don't open
 * connections that the server will immediately kill.
 */
const init = async () => {
  if (await isLoggedIn()) {
    void getWebSocket();
  }
  // If no cookies, the WebSocket will be created on demand when
  // getWebSocket() is called by a user action (e.g. inferEntities).
};

void init();
