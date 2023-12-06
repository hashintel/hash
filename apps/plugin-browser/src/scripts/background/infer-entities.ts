import type { VersionedUrl } from "@blockprotocol/graph";
import type {
  InferenceModelName,
  InferEntitiesReturn,
  InferEntitiesUserArguments,
} from "@local/hash-isomorphic-utils/temporal-types";
import { OwnedById } from "@local/hash-subgraph";
import type { Status } from "@local/status";
import { v4 as uuid } from "uuid";

import { setErroredBadge } from "../../shared/badge";
import type { InferEntitiesRequest } from "../../shared/messages";
import {
  getFromLocalStorage,
  getSetFromLocalStorageValue,
} from "../../shared/storage";

const inferEntitiesApiCall = async ({
  createAs,
  entityTypeIds,
  model,
  ownedById,
  textInput,
}: {
  createAs: "draft" | "live";
  model: InferenceModelName;
  textInput: string;
  entityTypeIds: VersionedUrl[];
  ownedById: OwnedById;
}) => {
  const requestBody: InferEntitiesUserArguments = {
    createAs,
    entityTypeIds,
    maxTokens: null,
    model,
    ownedById,
    textInput,
    temperature: 0,
  };

  return fetch(`${API_ORIGIN}/entities/infer`, {
    body: JSON.stringify(requestBody),
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  }).then((resp) => resp.json() as Promise<InferEntitiesReturn>);
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

  const localRequestId = uuid();

  const setInferenceRequestValue =
    getSetFromLocalStorageValue("inferenceRequests");

  await setInferenceRequestValue((currentValue) => [
    {
      createdAt: new Date().toISOString(),
      entityTypeIds,
      localRequestUuid: localRequestId,
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
    const inferredEntitiesReturn = await inferEntitiesApiCall({
      createAs,
      entityTypeIds,
      model,
      ownedById,
      textInput,
    });

    if (inferredEntitiesReturn.code !== "OK") {
      throw new Error(inferredEntitiesReturn.message);
    }

    await setInferenceRequestValue((currentValue) =>
      (currentValue ?? []).map((request) =>
        request.localRequestUuid === localRequestId
          ? {
              ...request,
              data: inferredEntitiesReturn,
              finishedAt: new Date().toISOString(),
              status: "complete",
            }
          : request,
      ),
    );
  } catch (err) {
    setErroredBadge();

    const errorMessage = (err as Error | Status<InferEntitiesReturn>).message;

    await setInferenceRequestValue((currentValue) =>
      (currentValue ?? []).map((request) =>
        request.localRequestUuid === localRequestId
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
