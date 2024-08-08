import type { VersionedUrl } from "@blockprotocol/type-system";
import { getWebMachineActorId } from "@local/hash-backend-utils/machine-actors";
import type { CreateEntityParameters } from "@local/hash-graph-sdk/entity";
import {
  Entity,
  LinkEntity,
  mergePropertyObjectAndMetadata,
} from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import {
  getSimplifiedActionInputs,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { PersistedEntity } from "@local/hash-isomorphic-utils/flows/types";
import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  HasObject,
  HasSubject,
} from "@local/hash-isomorphic-utils/system-types/claim";
import type { FileProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";
import { backOff } from "exponential-backoff";

import { getAiAssistantAccountIdActivity } from "../get-ai-assistant-account-id-activity.js";
import { extractErrorMessage } from "../infer-entities/shared/extract-validation-failure-details.js";
import { createInferredEntityNotification } from "../shared/create-inferred-entity-notification.js";
// import {
//   findExistingEntity,
//   findExistingLinkEntity,
// } from "../shared/find-existing-entity";
import { getFlowContext } from "../shared/get-flow-context.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { logProgress } from "../shared/log-progress.js";
import { getFileEntityFromUrl } from "./shared/get-file-entity-from-url.js";
import {
  getEntityUpdate,
  getLatestEntityById,
} from "./shared/graph-requests.js";
import type { FlowActionActivity } from "./types.js";

export const fileEntityTypeIds: VersionedUrl[] = [
  systemEntityTypes.file.entityTypeId,
  systemEntityTypes.image.entityTypeId,
  systemEntityTypes.document.entityTypeId,
  systemEntityTypes.pdfDocument.entityTypeId,
  systemEntityTypes.docxDocument.entityTypeId,
  systemEntityTypes.spreadsheetFile.entityTypeId,
  systemEntityTypes.pptxPresentation.entityTypeId,
];

export const persistEntityAction: FlowActionActivity = async ({ inputs }) => {
  const {
    flowEntityId,
    stepId,
    userAuthentication: { actorId },
    webId,
  } = await getFlowContext();

  const { draft, proposedEntityWithResolvedLinks } = getSimplifiedActionInputs({
    inputs,
    actionType: "persistEntity",
  });

  const createEditionAsDraft = draft ?? false;

  const {
    entityTypeId,
    localEntityId,
    claims,
    properties,
    linkData,
    provenance,
    propertyMetadata,
  } = proposedEntityWithResolvedLinks;

  const entityValues: Omit<
    CreateEntityParameters,
    "relationships" | "ownedById" | "draft" | "linkData"
  > & { linkData: Entity["linkData"] } = {
    entityTypeId,
    properties: mergePropertyObjectAndMetadata(properties, propertyMetadata),
    linkData,
    provenance,
  };

  const ownedById = webId;
  const entityUuid = extractEntityUuidFromEntityId(localEntityId);

  const isAiGenerated = provenance.actorType === "ai";

  const webBotActorId = isAiGenerated
    ? await getAiAssistantAccountIdActivity({
        authentication: { actorId },
        graphApiClient,
        grantCreatePermissionForWeb: ownedById,
      })
    : await getWebMachineActorId(
        { graphApi: graphApiClient },
        { actorId },
        { ownedById },
      );

  if (!webBotActorId) {
    throw new Error(
      `Could not get ${isAiGenerated ? "AI" : "web"} bot for web ${ownedById}`,
    );
  }

  /**
   * @todo: determine whether the entity type ID is a file entity type ID
   * by looking up the entity type's parents in the graph, rather than
   * relying on a hardcoded value.
   */
  const isFileEntity = fileEntityTypeIds.includes(entityTypeId);

  const fileUrl = isFileEntity
    ? (properties as Partial<FileProperties>)[
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/"
      ]
    : undefined;

  let entity: Entity;
  let existingEntity: Entity | undefined;
  let operation: "create" | "update";

  if (isFileEntity && fileUrl) {
    operation = "create";

    const getFileEntityFromUrlStatus = await getFileEntityFromUrl({
      entityUuid,
      url: fileUrl,
      propertyMetadata,
      provenance,
      entityTypeId,
    });

    if (getFileEntityFromUrlStatus.status !== "ok") {
      return {
        code: StatusCode.Internal,
        message: getFileEntityFromUrlStatus.message,
        contents: [
          {
            outputs: [
              {
                outputName:
                  "persistedEntity" as OutputNameForAction<"persistEntity">,
                payload: {
                  kind: "PersistedEntity",
                  value: { operation },
                },
              },
            ],
          },
        ],
      };
    }

    const { entity: updatedEntity } = getFileEntityFromUrlStatus;

    entity = updatedEntity;
  } else {
    /**
     * @todo: improve the logic for finding existing entities, to
     * reduce the number of false positives.
     */
    // existingEntity = await (linkData
    //   ? findExistingLinkEntity({
    //       actorId,
    //       graphApiClient,
    //       ownedById,
    //       linkData,
    //       includeDrafts: createEditionAsDraft,
    //     })
    //   : findExistingEntity({
    //       actorId,
    //       graphApiClient,
    //       ownedById,
    //       proposedEntity: proposedEntityWithResolvedLinks,
    //       includeDrafts: createEditionAsDraft,
    //     }));

    operation = existingEntity ? "update" : "create";

    try {
      if (existingEntity) {
        const { existingEntityIsDraft, isExactMatch, patchOperations } =
          getEntityUpdate({
            existingEntity,
            newProperties: mergePropertyObjectAndMetadata(
              properties,
              undefined,
            ),
          });

        const serializedEntity = existingEntity.toJSON();

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
                        entity: serializedEntity,
                        existingEntity: serializedEntity,
                        operation: "already-exists-as-proposed",
                      },
                    },
                  },
                ],
              },
            ],
          };
        }

        entity = await backOff(
          () =>
            existingEntity.patch(
              graphApiClient,
              { actorId: webBotActorId },
              {
                ...entityValues,
                draft: existingEntityIsDraft ? true : createEditionAsDraft,
                propertyPatches: patchOperations,
              },
            ),
          {
            jitter: "full",
            numOfAttempts: 3,
            startingDelay: 1_000,
          },
        );
      } else {
        entity = await backOff(
          () =>
            Entity.create(
              graphApiClient,
              { actorId: webBotActorId },
              {
                ...entityValues,
                draft: createEditionAsDraft,
                entityUuid,
                ownedById,
                relationships: createDefaultAuthorizationRelationships({
                  actorId,
                }),
              },
            ),
          {
            jitter: "full",
            numOfAttempts: 3,
            startingDelay: 1_000,
          },
        );
      }
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
                  value: {
                    existingEntity: existingEntity?.toJSON(),
                    operation,
                  },
                },
              },
            ],
          },
        ],
      };
    }
  }

  const persistedEntity = {
    entity: entity.toJSON(),
    existingEntity: existingEntity?.toJSON(),
    operation,
  } satisfies PersistedEntity;

  const createLinkFromClaimToEntity = async <
    T extends "has-object" | "has-subject",
  >(
    claimId: EntityId,
    linkType: T,
  ) => {
    const claim = await getLatestEntityById({
      graphApiClient,
      authentication: { actorId },
      entityId: claimId,
    });

    return LinkEntity.create<T extends "has-subject" ? HasSubject : HasObject>(
      graphApiClient,
      { actorId: webBotActorId },
      {
        draft,
        entityTypeId: `https://hash.ai/@hash/types/entity-type/${linkType}/v/1`,
        ownedById: webId,
        provenance: {
          ...claim.metadata.provenance,
          actorType: "ai",
          origin: {
            type: "flow",
            id: flowEntityId,
            stepIds: [stepId],
          },
        },
        linkData: {
          leftEntityId: claimId,
          rightEntityId: entity.entityId,
        },
        relationships: createDefaultAuthorizationRelationships({
          actorId,
        }),
        properties: { value: {} },
      },
    );
  };

  await Promise.all([
    ...claims.isSubjectOf.map(async (claimId) =>
      createLinkFromClaimToEntity(claimId, "has-subject"),
    ),
    ...claims.isObjectOf.map(async (claimId) =>
      createLinkFromClaimToEntity(claimId, "has-object"),
    ),
  ]);

  logProgress([
    {
      persistedEntity,
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
              value: persistedEntity,
            },
          },
        ],
      },
    ],
  };
};
