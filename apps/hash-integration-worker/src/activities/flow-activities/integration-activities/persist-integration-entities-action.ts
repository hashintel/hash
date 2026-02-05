import {
  type ActorEntityUuid,
  type EntityId,
  extractBaseUrl,
  type OriginProvenance,
  type ProvidedEntityEditionProvenance,
  type VersionedUrl,
  type WebId,
} from "@blockprotocol/type-system";
import type { IntegrationFlowActionActivity } from "@local/hash-backend-utils/flows";
import {
  getStorageProvider,
  resolveArrayPayloadValue,
  storePayload,
} from "@local/hash-backend-utils/flows/payload-storage";
import {
  generateEntityMatcher,
  generateLinkMatcher,
} from "@local/hash-backend-utils/integrations/aviation";
import type { GraphApi } from "@local/hash-graph-client";
import {
  HashEntity,
  HashLinkEntity,
  mergePropertyObjectAndMetadata,
  patchesFromPropertyObjects,
  queryEntities,
} from "@local/hash-graph-sdk/entity";
import { getSimplifiedIntegrationFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  FailedEntityProposal,
  PersistedEntitiesMetadata,
  PersistedEntityMetadata,
  ProposedEntity,
} from "@local/hash-isomorphic-utils/flows/types";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { stringifyError } from "@local/hash-isomorphic-utils/stringify-error";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";

import { getFlowContext } from "../shared/get-integration-flow-context.js";

const findExistingEntity = async (params: {
  authentication: { actorId: ActorEntityUuid };
  graphApiClient: GraphApi;
  proposedEntity: ProposedEntity;
  webId: WebId;
}): Promise<HashEntity | null> => {
  const { graphApiClient, authentication, proposedEntity, webId } = params;

  const [entityTypeId] = proposedEntity.entityTypeIds;
  const entityTypeBaseUrl = extractBaseUrl(entityTypeId);

  const entityMatcher = generateEntityMatcher[entityTypeBaseUrl];

  if (!entityMatcher) {
    // No matcher defined for this entity type, skip matching
    return null;
  }

  const propertyFilter = entityMatcher(proposedEntity);

  const { entities } = await queryEntities(
    { graphApi: graphApiClient },
    authentication,
    {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(entityTypeId, {
            ignoreParents: true,
          }),
          { equal: [{ path: ["webId"] }, { parameter: webId }] },
          { equal: [{ path: ["archived"] }, { parameter: false }] },
          propertyFilter,
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includePermissions: false,
    },
  );

  const [entity] = entities;
  return entity ?? null;
};

/**
 * Executes an array of async operations in parallel batches.
 *
 * This function processes items in batches, executing all operations within each batch
 * concurrently via `Promise.all`. Heartbeats are sent at the start of each batch to
 * signal activity progress to Temporal.
 *
 * **Error handling behavior:**
 * - If an operation throws an error, `Promise.all` will reject and the entire batch fails.
 * - For partial batch success, the operation callback should catch its own errors and
 *   return a result indicating success or failure (e.g., a discriminated union type).
 * - Successfully completed batches are preserved even if a later batch fails.
 *
 * @param items - The items to process
 * @param batchSize - Number of items to process in each batch
 * @param operation - Async function to execute for each item. Should handle its own errors
 *                    if partial batch success is desired.
 * @returns Array of results from all operations
 */
const executeInBatches = async <T, R>(
  items: T[],
  batchSize: number,
  operation: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    Context.current().heartbeat();
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(operation));
    results.push(...batchResults);
  }

  return results;
};

const findExistingLink = async (params: {
  authentication: { actorId: ActorEntityUuid };
  graphApiClient: GraphApi;
  leftEntityId: EntityId;
  linkEntityTypeId: VersionedUrl;
  rightEntityId: EntityId;
  webId: WebId;
}): Promise<HashLinkEntity | null> => {
  const {
    graphApiClient,
    authentication,
    linkEntityTypeId,
    leftEntityId,
    rightEntityId,
    webId,
  } = params;

  const linkTypeBaseUrl = extractBaseUrl(linkEntityTypeId);

  const linkMatcher = generateLinkMatcher[linkTypeBaseUrl];

  if (!linkMatcher) {
    // No matcher defined for this link type, skip matching
    return null;
  }

  const linkFilter = linkMatcher({ leftEntityId, rightEntityId });

  const { entities } = await queryEntities(
    { graphApi: graphApiClient },
    authentication,
    {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(linkEntityTypeId, {
            ignoreParents: true,
          }),
          { equal: [{ path: ["archived"] }, { parameter: false }] },
          { equal: [{ path: ["webId"] }, { parameter: webId }] },
          linkFilter,
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includePermissions: false,
    },
  );

  const [entity] = entities;
  return entity ? new HashLinkEntity(entity) : null;
};

const BATCH_SIZE = 100;

type EntityToCreate = {
  proposedEntity: ProposedEntity;
  params: Parameters<typeof HashEntity.create>[2];
};

type EntityToPatch = {
  proposedEntity: ProposedEntity;
  existingEntity: HashEntity;
  propertyPatches: Parameters<
    typeof HashEntity.prototype.patch
  >[2]["propertyPatches"];
};

type EntityUnchanged = {
  proposedEntity: ProposedEntity;
  existingEntity: HashEntity;
};

/**
 * Persists proposed entities to the graph, creating new entities as needed.
 * Returns the mapping of local entity IDs to persisted entity IDs.
 */
const persistEntities = async (params: {
  authentication: { actorId: ActorEntityUuid };
  graphApiClient: GraphApi;
  proposedEntities: ProposedEntity[];
  provenance: ProvidedEntityEditionProvenance;
  webId: WebId;
}): Promise<{
  persistedEntitiesMetadata: PersistedEntityMetadata[];
  failedEntityProposals: FailedEntityProposal[];
  entityIdsByLocalId: Map<EntityId, EntityId>;
}> => {
  const {
    authentication,
    graphApiClient,
    proposedEntities,
    provenance,
    webId,
  } = params;

  const persistedEntitiesMetadata: PersistedEntityMetadata[] = [];
  const failedEntityProposals: FailedEntityProposal[] = [];
  const entityIdsByLocalId = new Map<EntityId, EntityId>();

  const nonLinkEntities = proposedEntities.filter(
    (entity) => !entity.sourceEntityId && !entity.targetEntityId,
  );

  // Phase 1: Find existing entities and categorize operations
  const entitiesToCreate: EntityToCreate[] = [];
  const entitiesToPatch: EntityToPatch[] = [];
  const unchangedEntities: EntityUnchanged[] = [];

  for (const proposedEntity of nonLinkEntities) {
    Context.current().heartbeat();

    try {
      const existingEntity = await findExistingEntity({
        graphApiClient,
        authentication,
        proposedEntity,
        webId,
      });

      if (existingEntity) {
        const newProperties = mergePropertyObjectAndMetadata(
          proposedEntity.properties,
          proposedEntity.propertyMetadata,
        );

        const propertyPatches = patchesFromPropertyObjects({
          oldProperties: existingEntity.properties,
          newProperties,
          removeProperties: false,
        });

        if (propertyPatches.length > 0) {
          entitiesToPatch.push({
            proposedEntity,
            existingEntity,
            propertyPatches,
          });
        } else {
          unchangedEntities.push({ proposedEntity, existingEntity });
        }
      } else {
        entitiesToCreate.push({
          proposedEntity,
          params: {
            webId,
            draft: false,
            properties: mergePropertyObjectAndMetadata(
              proposedEntity.properties,
              proposedEntity.propertyMetadata,
            ),
            provenance: {
              ...provenance,
              sources: proposedEntity.provenance.sources,
            },
            entityTypeIds: proposedEntity.entityTypeIds,
          },
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      failedEntityProposals.push({
        proposedEntity,
        message: `Failed to find existing entity: ${errorMessage}. ${stringifyError(error)}`,
      });
    }
  }

  // Phase 2: Handle unchanged entities (no API call needed)
  for (const { proposedEntity, existingEntity } of unchangedEntities) {
    entityIdsByLocalId.set(
      proposedEntity.localEntityId,
      existingEntity.metadata.recordId.entityId,
    );
    persistedEntitiesMetadata.push({
      entityId: existingEntity.metadata.recordId.entityId,
      operation: "already-exists-as-proposed",
    });
  }

  // Phase 3: Batch create new entities in groups of BATCH_SIZE
  for (
    let batchStartIndex = 0;
    batchStartIndex < entitiesToCreate.length;
    batchStartIndex += BATCH_SIZE
  ) {
    Context.current().heartbeat();
    const batch = entitiesToCreate.slice(
      batchStartIndex,
      batchStartIndex + BATCH_SIZE,
    );

    try {
      const createdEntities = await HashEntity.createMultiple(
        graphApiClient,
        authentication,
        batch.map((item) => item.params),
      );

      for (
        let entityIndexInBatch = 0;
        entityIndexInBatch < createdEntities.length;
        entityIndexInBatch++
      ) {
        const proposedEntity = batch[entityIndexInBatch]!.proposedEntity;
        const createdEntity = createdEntities[entityIndexInBatch]!;

        entityIdsByLocalId.set(
          proposedEntity.localEntityId,
          createdEntity.metadata.recordId.entityId,
        );
        persistedEntitiesMetadata.push({
          entityId: createdEntity.metadata.recordId.entityId,
          operation: "create",
        });
      }
    } catch (error) {
      // If batch creation fails, add all entities in this batch to failed proposals
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      for (const { proposedEntity } of batch) {
        failedEntityProposals.push({
          proposedEntity,
          message: `Failed to create entity in batch: ${errorMessage}. ${stringifyError(error)}`,
        });
      }
    }
  }

  // Phase 4: Patch existing entities in parallel batches
  if (entitiesToPatch.length > 0) {
    const patchResults = await executeInBatches(
      entitiesToPatch,
      BATCH_SIZE,
      async ({ proposedEntity, existingEntity, propertyPatches }) => {
        try {
          const updatedEntity = await existingEntity.patch(
            graphApiClient,
            authentication,
            {
              propertyPatches,
              provenance: {
                ...provenance,
                sources: proposedEntity.provenance.sources,
              },
            },
          );
          return { success: true as const, proposedEntity, updatedEntity };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          return {
            success: false as const,
            proposedEntity,
            error: `Failed to patch entity: ${errorMessage}. ${stringifyError(error)}`,
          };
        }
      },
    );

    for (const result of patchResults) {
      if (result.success) {
        entityIdsByLocalId.set(
          result.proposedEntity.localEntityId,
          result.updatedEntity.metadata.recordId.entityId,
        );
        persistedEntitiesMetadata.push({
          entityId: result.updatedEntity.metadata.recordId.entityId,
          operation: "update",
        });
      } else {
        failedEntityProposals.push({
          proposedEntity: result.proposedEntity,
          message: result.error,
        });
      }
    }
  }

  return {
    persistedEntitiesMetadata,
    failedEntityProposals,
    entityIdsByLocalId,
  };
};

type LinkToCreate = {
  proposedLink: ProposedEntity;
  params: Parameters<typeof HashLinkEntity.create>[2];
};

type LinkToPatch = {
  proposedLink: ProposedEntity;
  existingLink: HashLinkEntity;
  propertyPatches: Parameters<
    typeof HashLinkEntity.prototype.patch
  >[2]["propertyPatches"];
};

type LinkUnchanged = {
  proposedLink: ProposedEntity;
  existingLink: HashLinkEntity;
};

/**
 * Persists proposed links to the graph, creating new links where they don't exist.
 */
const persistLinks = async (params: {
  authentication: { actorId: ActorEntityUuid };
  entityIdsByLocalId: Map<EntityId, EntityId>;
  graphApiClient: GraphApi;
  proposedEntities: ProposedEntity[];
  provenance: ProvidedEntityEditionProvenance;
  webId: WebId;
}): Promise<{
  persistedEntitiesMetadata: PersistedEntityMetadata[];
  failedEntityProposals: FailedEntityProposal[];
}> => {
  const {
    authentication,
    entityIdsByLocalId,
    graphApiClient,
    proposedEntities,
    provenance,
    webId,
  } = params;

  const persistedEntitiesMetadata: PersistedEntityMetadata[] = [];
  const failedEntityProposals: FailedEntityProposal[] = [];

  const linkEntities = proposedEntities.filter(
    (entity) => entity.sourceEntityId && entity.targetEntityId,
  );

  // Phase 1: Resolve entity IDs and find existing links
  const linksToCreate: LinkToCreate[] = [];
  const linksToPatch: LinkToPatch[] = [];
  const unchangedLinks: LinkUnchanged[] = [];

  for (const proposedLink of linkEntities) {
    Context.current().heartbeat();

    const { sourceEntityId, targetEntityId } = proposedLink;

    if (!sourceEntityId || !targetEntityId) {
      failedEntityProposals.push({
        proposedEntity: proposedLink,
        message: "Link entity missing sourceEntityId or targetEntityId",
      });
      continue;
    }

    const leftEntityId =
      sourceEntityId.kind === "proposed-entity"
        ? entityIdsByLocalId.get(sourceEntityId.localId)
        : sourceEntityId.entityId;

    const rightEntityId =
      targetEntityId.kind === "proposed-entity"
        ? entityIdsByLocalId.get(targetEntityId.localId)
        : targetEntityId.entityId;

    if (!leftEntityId || !rightEntityId) {
      failedEntityProposals.push({
        proposedEntity: proposedLink,
        message: `Could not resolve entity IDs for link: left=${leftEntityId}, right=${rightEntityId}`,
      });
      continue;
    }

    const [linkEntityTypeId] = proposedLink.entityTypeIds;

    try {
      const existingLink = await findExistingLink({
        graphApiClient,
        authentication,
        linkEntityTypeId,
        leftEntityId,
        rightEntityId,
        webId,
      });

      if (existingLink) {
        const newProperties = mergePropertyObjectAndMetadata(
          proposedLink.properties,
          proposedLink.propertyMetadata,
        );

        const propertyPatches = patchesFromPropertyObjects({
          oldProperties: existingLink.properties,
          newProperties,
          removeProperties: false,
        });

        if (propertyPatches.length > 0) {
          linksToPatch.push({
            proposedLink,
            existingLink,
            propertyPatches,
          });
        } else {
          unchangedLinks.push({ proposedLink, existingLink });
        }
      } else {
        linksToCreate.push({
          proposedLink,
          params: {
            webId,
            draft: false,
            linkData: {
              leftEntityId,
              rightEntityId,
            },
            properties: mergePropertyObjectAndMetadata(
              proposedLink.properties,
              proposedLink.propertyMetadata,
            ),
            provenance: {
              ...provenance,
              sources: proposedLink.provenance.sources,
            },
            entityTypeIds: proposedLink.entityTypeIds,
          },
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      failedEntityProposals.push({
        proposedEntity: proposedLink,
        message: `Failed to find existing link: ${errorMessage}. ${stringifyError(error)}`,
      });
    }
  }

  // Phase 2: Handle unchanged links (no API call needed)
  for (const { existingLink } of unchangedLinks) {
    persistedEntitiesMetadata.push({
      entityId: existingLink.metadata.recordId.entityId,
      operation: "already-exists-as-proposed",
    });
  }

  // Phase 3: Batch create new links in groups of BATCH_SIZE
  for (
    let batchStartIndex = 0;
    batchStartIndex < linksToCreate.length;
    batchStartIndex += BATCH_SIZE
  ) {
    Context.current().heartbeat();
    const batch = linksToCreate.slice(
      batchStartIndex,
      batchStartIndex + BATCH_SIZE,
    );

    try {
      const createdLinks = await HashLinkEntity.createMultiple(
        graphApiClient,
        authentication,
        batch.map((item) => item.params),
      );

      for (
        let linkIndexInBatch = 0;
        linkIndexInBatch < createdLinks.length;
        linkIndexInBatch++
      ) {
        const createdLink = createdLinks[linkIndexInBatch]!;
        persistedEntitiesMetadata.push({
          entityId: createdLink.metadata.recordId.entityId,
          operation: "create",
        });
      }
    } catch (error) {
      // If batch creation fails, add all links in this batch to failed proposals
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      for (const { proposedLink } of batch) {
        failedEntityProposals.push({
          proposedEntity: proposedLink,
          message: `Failed to create link in batch: ${errorMessage}. ${stringifyError(error)}`,
        });
      }
    }
  }

  // Phase 4: Patch existing links in parallel batches
  if (linksToPatch.length > 0) {
    const patchResults = await executeInBatches(
      linksToPatch,
      BATCH_SIZE,
      async ({ proposedLink, existingLink, propertyPatches }) => {
        try {
          const updatedLink = await existingLink.patch(
            graphApiClient,
            authentication,
            {
              propertyPatches,
              provenance: {
                ...provenance,
                sources: proposedLink.provenance.sources,
              },
            },
          );
          return { success: true as const, updatedLink };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          return {
            success: false as const,
            proposedLink,
            error: `Failed to patch link: ${errorMessage}. ${stringifyError(error)}`,
          };
        }
      },
    );

    for (const result of patchResults) {
      if (result.success) {
        persistedEntitiesMetadata.push({
          entityId: result.updatedLink.metadata.recordId.entityId,
          operation: "update",
        });
      } else {
        failedEntityProposals.push({
          proposedEntity: result.proposedLink,
          message: result.error,
        });
      }
    }
  }

  return { persistedEntitiesMetadata, failedEntityProposals };
};

/**
 * Creates the persist integration entities action that can be bound to a GraphApi client.
 */
export const createPersistIntegrationEntitiesAction = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}): IntegrationFlowActionActivity<"persistIntegrationEntities"> => {
  return async ({ inputs }) => {
    try {
      const {
        flowEntityId,
        runId,
        stepId,
        userAuthentication,
        webId,
        workflowId,
      } = await getFlowContext({ graphApiClient });

      const { proposedEntities: proposedEntitiesInput } =
        getSimplifiedIntegrationFlowActionInputs({
          inputs,
          actionType: "persistIntegrationEntities",
        });

      const proposedEntities = await resolveArrayPayloadValue(
        getStorageProvider(),
        "ProposedEntity",
        proposedEntitiesInput,
      );

      const provenance: ProvidedEntityEditionProvenance = {
        actorType: "machine",
        origin: {
          type: "flow",
          id: flowEntityId,
          stepIds: [stepId],
        } satisfies OriginProvenance,
      };
      const {
        persistedEntitiesMetadata: persistedNonLinkEntities,
        failedEntityProposals: failedNonLinkProposals,
        entityIdsByLocalId,
      } = await persistEntities({
        authentication: userAuthentication,
        graphApiClient,
        proposedEntities,
        provenance,
        webId,
      });

      const {
        persistedEntitiesMetadata: persistedLinkEntitiesMetadata,
        failedEntityProposals: failedLinkProposals,
      } = await persistLinks({
        authentication: userAuthentication,
        entityIdsByLocalId,
        graphApiClient,
        proposedEntities,
        provenance,
        webId,
      });

      const allPersistedEntities = [
        ...persistedNonLinkEntities,
        ...persistedLinkEntitiesMetadata,
      ];
      const allFailedProposals = [
        ...failedNonLinkProposals,
        ...failedLinkProposals,
      ];

      const result: PersistedEntitiesMetadata = {
        persistedEntities: allPersistedEntities,
        failedEntityProposals: allFailedProposals,
      };

      // Store the output in S3 to avoid passing large payloads through Temporal
      const storedRef = await storePayload({
        storageProvider: getStorageProvider(),
        workflowId,
        runId,
        stepId,
        outputName: "persistedEntities",
        kind: "PersistedEntitiesMetadata",
        value: result,
      });

      const code =
        allPersistedEntities.length > 0
          ? StatusCode.Ok
          : proposedEntities.length > 0
            ? StatusCode.Internal
            : StatusCode.Ok;

      const message =
        allPersistedEntities.length > 0
          ? `Persisted ${allPersistedEntities.length} entities${allFailedProposals.length > 0 ? `, ${allFailedProposals.length} failed` : ""}`
          : proposedEntities.length > 0
            ? `Failed to persist ${allFailedProposals.length} entities`
            : "No entities to persist";

      return {
        code,
        message,
        contents: [
          {
            outputs: [
              {
                outputName: "persistedEntities",
                payload: {
                  kind: "PersistedEntitiesMetadata",
                  value: storedRef,
                },
              },
            ],
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      return {
        code: StatusCode.Internal,
        message: `Failed to persist entities: ${errorMessage}`,
        contents: [],
      };
    }
  };
};
