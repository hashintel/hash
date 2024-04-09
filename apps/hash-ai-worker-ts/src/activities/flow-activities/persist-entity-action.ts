import { typedEntries } from "@local/advanced-types/typed-entries";
import { getWebMachineActorId } from "@local/hash-backend-utils/machine-actors";
import type { GraphApi, PatchOperation } from "@local/hash-graph-client";
import {
  getSimplifiedActionInputs,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import { mapGraphApiEntityMetadataToMetadata } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { Entity, OwnedById } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import isEqual from "lodash.isequal";
import isMatch from "lodash.ismatch";

import { createInferredEntityNotification } from "../shared/create-inferred-entity-notification";
import {
  findExistingEntity,
  findExistingLinkEntity,
} from "../shared/find-existing-entity";
import type { FlowActionActivity } from "./types";

export const persistEntityAction: FlowActionActivity<{
  graphApiClient: GraphApi;
}> = async ({ inputs, graphApiClient, userAuthentication: { actorId } }) => {
  const { draft, proposedEntityWithResolvedLinks, webId } =
    getSimplifiedActionInputs({
      inputs,
      actionType: "persistEntity",
    });

  const ownedById = webId ?? (actorId as OwnedById);

  const webBotActorId = await getWebMachineActorId(
    { graphApi: graphApiClient },
    { actorId },
    { ownedById },
  );

  const { entityTypeId, properties, linkData } =
    proposedEntityWithResolvedLinks;

  const entityValues = {
    entityTypeIds: [entityTypeId],
    properties,
    linkData,
  };

  const existingEntity = await (linkData
    ? findExistingLinkEntity({
        actorId,
        graphApiClient,
        linkData,
      })
    : findExistingEntity({
        actorId,
        graphApiClient,
        ownedById,
        proposedEntity: proposedEntityWithResolvedLinks,
      }));

  const operation = existingEntity ? "update" : "create";

  if (existingEntity) {
    const isExactMatch = isMatch(existingEntity.properties, properties);
    if (isExactMatch) {
      return {
        code: StatusCode.Ok,
        contents: [
          {
            outputs: [
              {
                outputName:
                  "persistedEntity" as OutputNameForAction<"persistEntity">,
                payload: {
                  kind: "PersistedEntity",
                  value: {
                    operation: "already-exists-as-proposed",
                    entity: existingEntity,
                  },
                },
              },
            ],
          },
        ],
      };
    }
  }

  const patchOperations: PatchOperation[] = [];

  if (existingEntity) {
    for (const [key, value] of typedEntries(properties)) {
      // @todo handle property objects
      if (!isEqual(existingEntity.properties[key], value)) {
        patchOperations.push({
          op: "replace",
          path: key,
          value,
        });
      }
    }
  }

  const { data: entityMetadata } = await (existingEntity
    ? graphApiClient.patchEntity(actorId, {
        entityId: existingEntity.metadata.recordId.entityId,
        properties: patchOperations,
      })
    : graphApiClient.createEntity(webBotActorId, {
        ...entityValues,
        draft: draft ?? false,
        ownedById,
        relationships: createDefaultAuthorizationRelationships({
          actorId,
        }),
      }));

  const entity: Entity = {
    metadata: mapGraphApiEntityMetadataToMetadata(entityMetadata),
    ...entityValues,
  };

  await createInferredEntityNotification({
    graphApiClient,
    entity,
    operation,
    notifiedUserAccountId: actorId,
  });

  return {
    code: StatusCode.Ok,
    contents: [
      {
        outputs: [
          {
            outputName:
              "persistedEntity" as OutputNameForAction<"persistEntity">,
            payload: {
              kind: "PersistedEntity",
              value: { operation, entity },
            },
          },
        ],
      },
    ],
  };
};
