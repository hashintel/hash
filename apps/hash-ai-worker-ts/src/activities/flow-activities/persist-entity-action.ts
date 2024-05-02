import { getWebMachineActorId } from "@local/hash-backend-utils/machine-actors";
import type { EntityMetadata } from "@local/hash-graph-client";
import {
  getSimplifiedActionInputs,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import { mapGraphApiEntityMetadataToMetadata } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { Entity } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";

import { extractErrorMessage } from "../infer-entities/shared/extract-validation-failure-details";
import { createInferredEntityNotification } from "../shared/create-inferred-entity-notification";
import {
  findExistingEntity,
  findExistingLinkEntity,
} from "../shared/find-existing-entity";
import { getFlowContext } from "../shared/get-flow-context";
import { logProgress } from "../shared/log-progress";
import { getEntityUpdate } from "./shared/graph-requests";
import type { FlowActionActivity } from "./types";

export const persistEntityAction: FlowActionActivity = async ({ inputs }) => {
  const {
    graphApiClient,
    userAuthentication: { actorId },
    webId,
  } = await getFlowContext();

  const { draft, proposedEntityWithResolvedLinks } = getSimplifiedActionInputs({
    inputs,
    actionType: "persistEntity",
  });

  const createEditionAsDraft = draft ?? false;

  const ownedById = webId;

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

  try {
    let entityMetadata: EntityMetadata;

    if (existingEntity) {
      const { existingEntityIsDraft, isExactMatch, patchOperations } =
        getEntityUpdate({
          existingEntity,
          newProperties: properties,
        });

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

      entityMetadata = await graphApiClient
        .patchEntity(actorId, {
          draft: existingEntityIsDraft ? true : createEditionAsDraft,
          entityId: existingEntity.metadata.recordId.entityId,
          properties: patchOperations,
        })
        .then((resp) => resp.data);
    } else {
      entityMetadata = await graphApiClient
        .createEntity(webBotActorId, {
          ...entityValues,
          draft: createEditionAsDraft,
          ownedById,
          relationships: createDefaultAuthorizationRelationships({
            actorId,
          }),
        })
        .then((resp) => resp.data);
    }

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
