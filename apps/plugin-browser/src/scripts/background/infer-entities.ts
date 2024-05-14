import type {
  AutomaticInferenceWebsocketRequestMessage,
  CancelInferEntitiesWebsocketRequestMessage,
  ExternalInputWebsocketResponseMessage,
  InferenceWebsocketServerMessage,
  InferEntitiesReturn,
  ManualInferenceWebsocketRequestMessage,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import type {
  AutomaticInferenceArguments,
  ManualInferenceArguments,
} from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-types";
import type { Status } from "@local/status";
import { v4 as uuid } from "uuid";
import browser from "webextension-polyfill";

import { setErroredBadge } from "../../shared/badge";
import type { InferEntitiesRequest } from "../../shared/messages";
import {
  getFromLocalStorage,
  getSetFromLocalStorageValue,
} from "../../shared/storage";
import { getWebsiteContent } from "./infer-entities/get-website-content";

const setInferenceRequestValue =
  getSetFromLocalStorageValue("inferenceRequests");

const setExternalInputRequestsValue = getSetFromLocalStorageValue(
  "externalInputRequests",
);

const getCookieString = async () => {
  const cookies = await browser.cookies
    .getAll({
      url: API_ORIGIN,
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

  const { host, protocol } = new URL(API_ORIGIN);
  const websocketUrl = `${protocol === "https:" ? "wss" : "ws"}://${host}`;

  ws = new WebSocket(websocketUrl);

  const heartbeat = setInterval(() => {
    ws?.send("ping");
  }, 20_000);

  ws.addEventListener("close", () => {
    console.log("Connection closed");
    ws = null;
    clearInterval(heartbeat);
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
  requestUuid,
}: {
  requestUuid: string;
}) => {
  const cookie = await getCookieString();

  const socket = await getWebSocket();

  socket.send(
    JSON.stringify({
      cookie,
      requestUuid,
      type: "cancel-inference-request",
    } satisfies CancelInferEntitiesWebsocketRequestMessage),
  );
};

export const inferEntities = async (
  message: InferEntitiesRequest,
  trigger: "automatic" | "manual",
) => {
  const user = await getFromLocalStorage("user");
  if (!user) {
    throw new Error("Cannot infer entities without a logged-in user.");
  }

  const {
    createAs,
    entityTypeIds,
    model,
    ownedById,
    sourceUrl,
    sourceTitle,
    textInput,
  } = message;

  const requestUuid = uuid();

  await setInferenceRequestValue((currentValue) => [
    {
      createAs,
      createdAt: new Date().toISOString(),
      entityTypeIds,
      requestUuid,
      model,
      ownedById,
      status: "pending",
      sourceTitle,
      sourceUrl,
      trigger,
    },
    ...(currentValue ?? []),
  ]);

  const basePayload = {
    visitedWebPage: {
      kind: "WebPage",
      value: {
        htmlContent: textInput,
        title: sourceTitle,
        url: sourceUrl,
      },
    },
  };

  const payload: AutomaticInferenceArguments | ManualInferenceArguments =
    trigger === "automatic"
      ? basePayload
      : {
          ...basePayload,
          draft: {
            kind: "Boolean",
            value: createAs === "draft",
          },
          entityTypeIds: entityTypeIds.map((entityTypeId) => ({
            kind: "VersionedUrl",
            value: entityTypeId,
          })),
          model: {
            kind: "Text",
            value: model,
          },
        };

  try {
    await sendInferEntitiesMessage({
      requestUuid,
      payload,
      type:
        trigger === "automatic"
          ? "automatic-inference-request"
          : "manual-inference-request",
    });
  } catch (err) {
    setErroredBadge();

    const errorMessage = (err as Error | Status<InferEntitiesReturn>).message;

    await setInferenceRequestValue((currentValue) =>
      (currentValue ?? []).map((request) =>
        request.requestUuid === requestUuid
          ? {
              ...request,
              errorMessage: errorMessage ?? "Unknown error – please contact us",
              finishedAt: new Date().toISOString(),
              status: "error",
            }
          : request,
      ),
    );
  }
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
