import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import type { FlowActionActivity } from "@local/hash-backend-utils/flows";
import { getWebMachineId } from "@local/hash-backend-utils/machine-actors";
import type { CreateEntityParameters } from "@local/hash-graph-sdk/entity";
import {
  HashEntity,
  HashLinkEntity,
  mergePropertyObjectAndMetadata,
} from "@local/hash-graph-sdk/entity";
import {
  getSimplifiedAiFlowActionInputs,
  type OutputNameForAiFlowAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { PersistedEntityMetadata } from "@local/hash-isomorphic-utils/flows/types";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  HasObject,
  HasSubject,
} from "@local/hash-isomorphic-utils/system-types/claim";
import type { FileProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";
import { backOff } from "exponential-backoff";

import { getAiAssistantAccountIdActivity } from "../get-ai-assistant-account-id-activity.js";
import { extractErrorMessage } from "../infer-entities/shared/extract-validation-failure-details.js";
import { createInferredEntityNotification } from "../shared/create-inferred-entity-notification.js";
import {
  findExistingEntity,
  findExistingLinkEntity,
} from "../shared/find-existing-entity.js";
import { getFlowContext } from "../shared/get-flow-context.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { logProgress } from "../shared/log-progress.js";
import type { MatchedEntityUpdate } from "../shared/match-existing-entity.js";
import { createFileEntityFromUrl } from "./shared/create-file-entity-from-url.js";
import {
  getEntityUpdate,
  getLatestEntityById,
} from "./shared/graph-requests.js";

export const fileEntityTypeIds: VersionedUrl[] = [
  systemEntityTypes.file.entityTypeId,
  systemEntityTypes.imageFile.entityTypeId,
  systemEntityTypes.documentFile.entityTypeId,
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

  const { draft, proposedEntityWithResolvedLinks } =
    getSimplifiedAiFlowActionInputs({
      inputs,
      actionType: "persistEntity",
    });

  const createEditionAsDraft = draft ?? false;

  const {
    entityTypeIds,
    localEntityId,
    claims,
    properties,
    linkData,
    provenance,
    propertyMetadata,
  } = proposedEntityWithResolvedLinks;

  const entityValues: Omit<
    CreateEntityParameters,
    "relationships" | "webId" | "draft" | "linkData"
  > & { linkData: HashEntity["linkData"] } = {
    entityTypeIds,
    properties: mergePropertyObjectAndMetadata(properties, propertyMetadata),
    linkData,
    provenance,
  };

  const entityUuid = extractEntityUuidFromEntityId(localEntityId);

  const isAiGenerated = provenance.actorType === "ai";

  const webBotActorId = isAiGenerated
    ? await getAiAssistantAccountIdActivity({
        authentication: { actorId },
        graphApiClient,
        grantCreatePermissionForWeb: webId,
      })
    : await getWebMachineId(
        { graphApi: graphApiClient },
        { actorId },
        { webId },
      ).then((maybeMachineId) => {
        if (!maybeMachineId) {
          throw new Error(
            `Failed to get web bot account ID for web ID: ${webId}`,
          );
        }
        return maybeMachineId;
      });

  if (!webBotActorId) {
    throw new Error(
      `Could not get ${isAiGenerated ? "AI" : "web"} bot for web ${webId}`,
    );
  }

  /**
   * @todo: determine whether the entity type ID is a file entity type ID
   * by looking up the entity type's parents in the graph, rather than
   * relying on a hardcoded value.
   */
  const isFileEntity = entityTypeIds.some((entityTypeId) =>
    fileEntityTypeIds.includes(entityTypeId),
  );

  const fileUrl = isFileEntity
    ? (properties as Partial<FileProperties>)[
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/"
      ]
    : undefined;

  let entity: HashEntity;
  let matchedEntityUpdate: MatchedEntityUpdate<HashEntity> | null = null;
  let operation: "create" | "update";

  if (isFileEntity && fileUrl) {
    operation = "create";

    const createFileEntityFromUrlStatus = await createFileEntityFromUrl({
      entityUuid,
      url: fileUrl,
      propertyMetadata,
      provenance,
      entityTypeIds,
    });

    if (createFileEntityFromUrlStatus.status !== "ok") {
      return {
        code: StatusCode.Internal,
        message: createFileEntityFromUrlStatus.message,
        contents: [],
      };
    }

    const { entity: updatedEntity } = createFileEntityFromUrlStatus;

    entity = updatedEntity;
  } else {
    matchedEntityUpdate = await (linkData
      ? /**
         * @todo H-3883 ensure that the creation of a new link will not violate min/max links on an entity
         */
        findExistingLinkEntity({
          actorId,
          graphApiClient,
          webId,
          linkData,
          proposedEntity: proposedEntityWithResolvedLinks,
          includeDrafts: createEditionAsDraft,
        })
      : findExistingEntity({
          actorId,
          graphApiClient,
          webId,
          proposedEntity: proposedEntityWithResolvedLinks,
          includeDrafts: createEditionAsDraft,
        }));

    operation = matchedEntityUpdate ? "update" : "create";

    try {
      if (matchedEntityUpdate) {
        const { existingEntityIsDraft, patchOperations } = getEntityUpdate({
          existingEntity: matchedEntityUpdate.existingEntity,
          newPropertiesWithMetadata: mergePropertyObjectAndMetadata(
            matchedEntityUpdate.newValues.properties,
            matchedEntityUpdate.newValues.propertyMetadata,
          ),
        });

        /**
         * In practice we don't reassign matchedEntityUpdate anywhere below it doesn't harm to make sure it will always
         * be the same thing in the backOff function.
         */
        const stableReferenceToMatchedEntity = matchedEntityUpdate;

        entity = await backOff(
          () =>
            stableReferenceToMatchedEntity.existingEntity.patch(
              graphApiClient,
              { actorId: webBotActorId },
              {
                entityTypeIds:
                  stableReferenceToMatchedEntity.newValues.entityTypeIds,
                draft: existingEntityIsDraft ? true : createEditionAsDraft,
                propertyPatches: patchOperations,
                provenance: {
                  ...entityValues.provenance,
                  sources:
                    stableReferenceToMatchedEntity.newValues.editionSources,
                },
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
            HashEntity.create(
              graphApiClient,
              { actorId: webBotActorId },
              {
                ...entityValues,
                draft: createEditionAsDraft,
                entityUuid,
                webId,
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
        contents: [],
      };
    }
  }

  const persistedEntityMetadata = {
    entityId: entity.metadata.recordId.entityId,
    operation,
  } satisfies PersistedEntityMetadata;

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
      includeDrafts: draft,
    });

    const entityTypeId =
      `https://hash.ai/@h/types/entity-type/${linkType}/v/1` as const;

    return HashLinkEntity.create<
      T extends "has-subject" ? HasSubject : HasObject
    >(
      graphApiClient,
      { actorId: webBotActorId },
      {
        draft,
        entityTypeIds: [entityTypeId],
        webId,
        provenance: {
          sources: claim.metadata.provenance.edition.sources,
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
      persistedEntityMetadata,
      recordedAt: new Date().toISOString(),
      stepId: Context.current().info.activityId,
      type: "PersistedEntityMetadata",
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
              "persistedEntity" as OutputNameForAiFlowAction<"persistEntity">,
            payload: {
              kind: "PersistedEntityMetadata",
              value: persistedEntityMetadata,
            },
          },
        ],
      },
    ],
  };
};
