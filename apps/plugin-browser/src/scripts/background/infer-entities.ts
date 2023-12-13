import type { VersionedUrl } from "@blockprotocol/graph";
import type {
  InferenceModelName,
  InferEntitiesReturn,
  InferEntitiesUserArguments,
  InferEntitiesWebSocketResponseMessage,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import { OwnedById } from "@local/hash-subgraph";
import type { Status } from "@local/status";
import { io } from "socket.io-client";
import { v4 as uuid } from "uuid";

import { setErroredBadge } from "../../shared/badge";
import type { InferEntitiesRequest } from "../../shared/messages";
import {
  getFromLocalStorage,
  getSetFromLocalStorageValue,
} from "../../shared/storage";

const socket = io(API_ORIGIN, { autoConnect: false, withCredentials: true });

let socketDisconnectTimeout: NodeJS.Timer;

const setInferenceRequestValue =
  getSetFromLocalStorageValue("inferenceRequests");

socket.on("message", async (message: InferEntitiesWebSocketResponseMessage) => {
  const inferredEntitiesReturn = message.contents;

  if (inferredEntitiesReturn.code !== "OK") {
    const errorMessage = inferredEntitiesReturn.message;

    await setInferenceRequestValue((currentValue) =>
      (currentValue ?? []).map((request) =>
        request.requestUuid === inferredEntitiesReturn.requestUuid
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

  await setInferenceRequestValue((currentValue) =>
    (currentValue ?? []).map((request) =>
      request.requestUuid === localRequestId
        ? {
            ...request,
            data: inferredEntitiesReturn,
            finishedAt: new Date().toISOString(),
            status: "complete",
          }
        : request,
    ),
  );

  const inferenceRequests = await getFromLocalStorage("inferenceRequests");
  const pendingRequests = inferenceRequests?.filter(
    (request) => request.status === "pending",
  );
  if (!pendingRequests?.length) {
    socketDisconnectTimeout = setTimeout(() => {
      socket.disconnect();
    }, 30_000);
  }
});

const sendInferEntitiesMessage = async (params: {
  createAs: "draft" | "live";
  model: InferenceModelName;
  textInput: string;
  entityTypeIds: VersionedUrl[];
  ownedById: OwnedById;
  requestUuid: string;
  sourceTitle: string;
  sourceUrl: string;
}) => {
  clearTimeout(socketDisconnectTimeout);

  const inferMessageContent: InferEntitiesUserArguments = {
    ...params,
    maxTokens: null,
    temperature: 0,
  };

  while (!socket.connected) {
    socket.connect();
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
  }

  socket.send(inferMessageContent);
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

  const setInferenceRequestValue =
    getSetFromLocalStorageValue("inferenceRequests");

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
      createAs,
      entityTypeIds,
      model,
      ownedById,
      requestUuid,
      sourceTitle,
      sourceUrl,
      textInput,
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
