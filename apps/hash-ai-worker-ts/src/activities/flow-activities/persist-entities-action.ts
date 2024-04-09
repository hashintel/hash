import type { GraphApi } from "@local/hash-graph-client";
import {
  getSimplifiedActionInputs,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { PersistedEntity } from "@local/hash-isomorphic-utils/flows/types";
import type { OwnedById } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";

import type { FlowActionActivity } from "./types";

export const persistEntitiesAction: FlowActionActivity<{
  graphApiClient: GraphApi;
}> = async ({ inputs, graphApiClient, userAuthentication }) => {
  const { draft, proposedEntities, webId } = getSimplifiedActionInputs({
    inputs,
    actionType: "persistEntities",
  });

  const ownedById = webId ?? (userAuthentication.actorId as OwnedById);

  const persistedEntitiesByLocalId: Record<string, PersistedEntity> = {};

  const entitiesWithDepenciesSortedLast = [...proposedEntities].sort((a, b) => {
    if (
      (a.sourceEntityLocalId && b.sourceEntityLocalId) ||
      (!a.sourceEntityLocalId && !b.sourceEntityLocalId)
    ) {
      return 0;
    }

    // @todo handle cases where a link entity is dependent on another link entity
    if (a.sourceEntityLocalId) {
      return 1;
    }

    return -1;
  });

  for (const proposedEntity of entitiesWithDepenciesSortedLast) {
    const persistedEntityOutputs = await persistEntitiesAction({
      inputs: [
        {
          inputName: "draft",
          payload: { kind: "Boolean", value: draft ?? false },
        },
        {
          inputName: "proposedEntity",
          payload: { kind: "ProposedEntity", value: proposedEntity },
        },
        {
          inputName: "webId",
          payload: { kind: "WebId", value: ownedById },
        },
      ],
      graphApiClient,
      userAuthentication,
    });

    const outputs = persistedEntityOutputs.contents[0]?.outputs;

    const persistedEntity: PersistedEntity = {
      operation: outputs?.find((output) => output.outputName === "operation")
        ?.payload.value,
      entity: outputs?.find((output) => output.outputName === "entity")?.payload
        .value,
    };

    persistedEntitiesByLocalId[proposedEntity.localEntityId] = persistedEntity;
  }

  return {
    code: StatusCode.Ok,
    contents: [
      {
        outputs: [
          {
            outputName:
              "persistedEntities" as OutputNameForAction<"persistEntities">,
            payload: {
              kind: "PersistedEntity",
              value: Object.values(persistedEntitiesByLocalId),
            },
          },
        ],
      },
    ],
  };
};
