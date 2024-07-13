import type { EntityUuid } from "@local/hash-graph-types/entity";
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

const waitForConnection = async (ws: WebSocket) => {
  while (ws.readyState !== ws.OPEN) {
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
  }
};

let ws: WebSocket | null = null;
const getWebSocket = async () => {
  if (ws) {
    await waitForConnection(ws);
    return ws;
  }

  const apiOrigin = await getFromLocalStorage("apiOrigin");

  const { host, protocol } = new URL(apiOrigin ?? API_ORIGIN);
  const websocketUrl = `${protocol === "https:" ? "wss" : "ws"}://${host}`;

  ws = new WebSocket(websocketUrl);

  const externalRequestPoll = setInterval(() => {
    void getCookieString().then((cookie) =>
      ws?.send(
        JSON.stringify({
          cookie,
          type: "check-for-external-input-requests",
        } satisfies CheckForExternalInputRequestsWebsocketRequestMessage),
      ),
    );
  }, 20_000);

  ws.addEventListener("close", () => {
    console.log("Connection closed");
    ws = null;
    clearInterval(externalRequestPoll);
  });

  ws.addEventListener("open", () => {
    console.log("Connection established");
  });

  ws.addEventListener(
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
        } else {
          await setExternalInputRequestsValue((requestsById) => ({
            ...requestsById,
            [payload.requestId]: {
              message,
              receivedAt: new Date().toISOString(),
            },
          }));
        }

        const webPages = await getWebsiteContent(payload.data.urls);

        const cookie = await getCookieString();

        ws?.send(
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
      }
    },
  );

  await waitForConnection(ws);

  return ws;
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

  const { createAs, entityTypeIds, model, ownedById, sourceWebPage } = message;

  const requestUuid = uuid() as EntityUuid;

  const basePayload = {
    webId: ownedById,
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
      webId: ownedById,
      inputRequests: [],
      inputs: [
        {
          flowDefinition,
          flowTrigger: {
            triggerDefinitionId: flowDefinition.trigger.triggerDefinitionId,
            outputs: [],
          },
          webId: ownedById,
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
  setInterval(() => {
    void getWebSocket();
  }, 10_000);

  void getWebSocket();
};

init();
