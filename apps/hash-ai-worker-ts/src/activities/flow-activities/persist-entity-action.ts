import { typedEntries } from "@local/advanced-types/typed-entries";
import { getWebMachineActorId } from "@local/hash-backend-utils/machine-actors";
import type {
  GraphApi,
  PropertyPatchOperation,
} from "@local/hash-graph-client";
import {
  getSimplifiedActionInputs,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import { mapGraphApiEntityMetadataToMetadata } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { Entity, OwnedById } from "@local/hash-subgraph";
import { extractDraftIdFromEntityId } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";
import isEqual from "lodash.isequal";
import isMatch from "lodash.ismatch";

import { extractErrorMessage } from "../infer-entities/shared/extract-validation-failure-details";
import { createInferredEntityNotification } from "../shared/create-inferred-entity-notification";
import {
  findExistingEntity,
  findExistingLinkEntity,
} from "../shared/find-existing-entity";
import { logProgress } from "../shared/log-progress";
import type { FlowActionActivity } from "./types";

export const persistEntityAction: FlowActionActivity<{
  graphApiClient: GraphApi;
}> = async ({ inputs, graphApiClient, userAuthentication: { actorId } }) => {
  const { draft, proposedEntityWithResolvedLinks, webId } =
    getSimplifiedActionInputs({
      inputs,
      actionType: "persistEntity",
    });

  const createEditionAsDraft = draft ?? false;

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
        ownedById,
        linkData,
        includeDrafts: createEditionAsDraft,
      })
    : findExistingEntity({
        actorId,
        graphApiClient,
        ownedById,
        proposedEntity: proposedEntityWithResolvedLinks,
        includeDrafts: createEditionAsDraft,
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
                    entity: existingEntity,
                    existingEntity,
                    operation: "already-exists-as-proposed",
                  },
                },
              },
            ],
          },
        ],
      };
    }
  }

  const patchOperations: PropertyPatchOperation[] = [];

  let existingEntityIsDraft: boolean | undefined;
  if (existingEntity) {
    for (const [key, value] of typedEntries(properties)) {
      // @todo better handle property objects, will currently overwrite the entire object if there are any differences
      if (!isEqual(existingEntity.properties[key], value)) {
        patchOperations.push({
          op: existingEntity.properties[key] ? "replace" : "add",
          path: [key],
          value,
        });
      }
    }

    existingEntityIsDraft = !!extractDraftIdFromEntityId(
      existingEntity.metadata.recordId.entityId,
    );
  }

  try {
    const { data: entityMetadata } = await (existingEntity
      ? graphApiClient.patchEntity(actorId, {
          draft: existingEntityIsDraft ? true : createEditionAsDraft,
          entityId: existingEntity.metadata.recordId.entityId,
          properties: patchOperations,
        })
      : graphApiClient.createEntity(webBotActorId, {
          ...entityValues,
          draft: createEditionAsDraft,
          ownedById,
          relationships: createDefaultAuthorizationRelationships({
            actorId,
          }),
        }));

    const entity: Entity = {
      metadata: mapGraphApiEntityMetadataToMetadata(entityMetadata),
      ...entityValues,
    };

    logProgress([
      {
        persistedEntity: {
          entity,
          existingEntity: existingEntity ?? undefined,
          operation,
        },
        recordedAt: new Date().toISOString(),
        stepId: Context.current().info.activityId,
        type: "PersistedEntity",
      },
    ]);

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
                value: { operation, entity, existingEntity },
              },
            },
          ],
        },
      ],
    };
  } catch (err) {
    return {
      code: StatusCode.Internal,
      message: `Could not persist entity: ${extractErrorMessage(err)}`,
      contents: [
        {
          outputs: [
            {
              outputName:
                "persistedEntity" as OutputNameForAction<"persistEntity">,
              payload: {
                kind: "PersistedEntity",
                value: { existingEntity, operation },
              },
            },
          ],
        },
      ],
    };
  }
};
