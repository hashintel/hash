import type { VersionedUrl } from "@blockprotocol/graph";
import type {
  InferenceModelName,
  InferEntitiesRequestMessage,
  InferEntitiesResponseMessage,
  InferEntitiesReturn,
  InferEntitiesUserArguments,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import { OwnedById } from "@local/hash-subgraph";
import type { Status } from "@local/status";
import { v4 as uuid } from "uuid";
import browser from "webextension-polyfill";

import { setErroredBadge } from "../../shared/badge";
import type { InferEntitiesRequest } from "../../shared/messages";
import {
  getFromLocalStorage,
  getSetFromLocalStorageValue,
} from "../../shared/storage";

const setInferenceRequestValue =
  getSetFromLocalStorageValue("inferenceRequests");

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
      const message = JSON.parse(event.data) as InferEntitiesResponseMessage;

      const { payload: inferredEntitiesReturn, requestUuid, status } = message;

      if (
        status === "bad-request" ||
        (inferredEntitiesReturn.code !== "OK" &&
          inferredEntitiesReturn.contents.length === 0)
      ) {
        const errorMessage = inferredEntitiesReturn.message;

        await setInferenceRequestValue((currentValue) =>
          (currentValue ?? []).map((requestInState) =>
            requestInState.requestUuid === requestUuid
              ? {
                  ...requestInState,
                  errorMessage:
                    errorMessage ?? "Unknown error – please contact us",
                  finishedAt: new Date().toISOString(),
                  status: "error",
                }
              : requestInState,
          ),
        );
        return;
      }

      await setInferenceRequestValue((currentValue) =>
        (currentValue ?? []).map((requestInState) =>
          requestInState.requestUuid === requestUuid
            ? {
                ...requestInState,
                data: inferredEntitiesReturn,
                finishedAt: new Date().toISOString(),
                status,
              }
            : requestInState,
        ),
      );
    },
  );

  await waitForConnection(ws);

  return ws;
};

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

const sendInferEntitiesMessage = async (params: {
  requestUuid: string;
  payload: Omit<
    InferEntitiesRequestMessage["payload"],
    "cookie" | "maxTokens" | "temperature"
  >;
}) => {
  const { requestUuid, payload } = params;

  const socket = await getWebSocket();

  const inferMessagePayload: InferEntitiesUserArguments = {
    ...payload,
    maxTokens: null,
    temperature: 0,
  };

  const cookie = await getCookieString();

  socket.send(
    JSON.stringify({
      cookie,
      payload: inferMessagePayload,
      requestUuid,
      type: "inference-request",
    }),
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
    }),
  );
};

export const inferEntities = async (
  message: InferEntitiesRequest,
  trigger: "passive" | "user",
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

  try {
    await sendInferEntitiesMessage({
      requestUuid,
      payload: {
        createAs,
        entityTypeIds,
        model,
        ownedById,
        sourceTitle,
        sourceUrl,
        textInput,
      },
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
