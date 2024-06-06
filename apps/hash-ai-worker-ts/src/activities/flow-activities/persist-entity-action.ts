import type { VersionedUrl } from "@blockprotocol/type-system";
import { getWebMachineActorId } from "@local/hash-backend-utils/machine-actors";
import type {
  CreateEntityRequest,
  EntityMetadata,
} from "@local/hash-graph-client";
import {
  getSimplifiedActionInputs,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { mapGraphApiEntityMetadataToMetadata } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { FileProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import type { Entity } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";

import { getAiAssistantAccountIdActivity } from "../get-ai-assistant-account-id-activity";
import { extractErrorMessage } from "../infer-entities/shared/extract-validation-failure-details";
import { createInferredEntityNotification } from "../shared/create-inferred-entity-notification";
// import {
//   findExistingEntity,
//   findExistingLinkEntity,
// } from "../shared/find-existing-entity";
import { getFlowContext } from "../shared/get-flow-context";
import { graphApiClient } from "../shared/graph-api-client";
import { logProgress } from "../shared/log-progress";
import { getFileEntityFromUrl } from "./shared/get-file-entity-from-url";
import { getEntityUpdate } from "./shared/graph-requests";
import type { FlowActionActivity } from "./types";

const fileEntityTypeIds: VersionedUrl[] = [
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
    userAuthentication: { actorId },
    webId,
  } = await getFlowContext();

  const { draft, proposedEntityWithResolvedLinks } = getSimplifiedActionInputs({
    inputs,
    actionType: "persistEntity",
  });

  const createEditionAsDraft = draft ?? false;

  const { entityTypeId, properties, linkData, provenance, propertyMetadata } =
    proposedEntityWithResolvedLinks;

  const entityValues: Omit<
    CreateEntityRequest,
    "relationships" | "ownedById" | "draft" | "linkData"
  > & { linkData: Entity["linkData"] } = {
    entityTypeIds: [entityTypeId],
    properties,
    linkData,
    provenance,
    propertyMetadata,
  };

  const ownedById = webId;

  const isAiGenerated = provenance?.actorType === "ai";

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

    const { entityMetadata, properties: updatedProperties } =
      getFileEntityFromUrlStatus;

    entity = {
      metadata: entityMetadata,
      ...entityValues,
      properties: updatedProperties,
    };
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
          .patchEntity(webBotActorId, {
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

      entity = {
        metadata: mapGraphApiEntityMetadataToMetadata(entityMetadata),
        ...entityValues,
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
  }

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
};
