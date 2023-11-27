import { VersionedUrl } from "@blockprotocol/graph";
import {
  InferEntitiesReturn,
  InferEntitiesUserArguments,
} from "@local/hash-isomorphic-utils/temporal-types";
import {
  EntityId,
  extractOwnedByIdFromEntityId,
  OwnedById,
} from "@local/hash-subgraph";
import type { Status } from "@local/status";
import { v4 as uuid } from "uuid";

import {
  setErroredBadge,
  setLoadingBadge,
  setSuccessBadge,
} from "../../shared/badge";
import { InferEntitiesRequest } from "../../shared/messages";
import {
  getFromSessionStorage,
  getSetFromSessionStorageValue,
} from "../../shared/storage";

const inferEntitiesApiCall = async ({
  entityTypeIds,
  ownedById,
  textInput,
}: {
  textInput: string;
  entityTypeIds: VersionedUrl[];
  ownedById: OwnedById;
}) => {
  const requestBody: InferEntitiesUserArguments = {
    entityTypeIds,
    maxTokens: null,
    model: "gpt-4-1106-preview",
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
  }).then((resp) => resp.json() as Promise<InferEntitiesReturn>);
};

export const inferEntities = async (message: InferEntitiesRequest) => {
  const localRequestId = uuid();

  const setInferenceStatusValue =
    getSetFromSessionStorageValue("inferenceStatus");

  await setInferenceStatusValue((currentValue) => [
    ...(currentValue ?? []),
    {
      localRequestUuid: localRequestId,
      details: { status: "pending" },
      sourceTitle: message.sourceTitle,
      sourceUrl: message.sourceUrl,
    },
  ]);

  setLoadingBadge();

  const user = await getFromSessionStorage("user");
  if (!user) {
    throw new Error("Cannot infer entities without a logged-in user.");
  }

  try {
    const { entityTypeIds, textInput } = message;

    const inferredEntitiesReturn = await inferEntitiesApiCall({
      entityTypeIds,
      ownedById: extractOwnedByIdFromEntityId(
        user.metadata.recordId.entityId as EntityId,
      ),
      textInput,
    });

    void setSuccessBadge(1);

    await setInferenceStatusValue((currentValue) =>
      (currentValue ?? []).map((status) =>
        status.localRequestUuid === localRequestId
          ? {
              ...status,
              details: { status: "complete", data: inferredEntitiesReturn },
            }
          : status,
      ),
    );
  } catch (err) {
    setErroredBadge();

    const errorMessage = (err as Error | Status<InferEntitiesReturn>).message;

    await setInferenceStatusValue((currentValue) =>
      (currentValue ?? []).map((status) =>
        status.localRequestUuid === localRequestId
          ? {
              ...status,
              details: {
                message: errorMessage ?? "Unknown error – please contact us",
                status: "error",
              },
            }
          : status,
      ),
    );
  }
};
