import type { EntityId } from "@blockprotocol/type-system";
import type { AiFlowActionActivity } from "@local/hash-backend-utils/flows";
import {
  getStorageProvider,
  resolveArrayPayloadValue,
} from "@local/hash-backend-utils/flows/payload-storage";
import { flattenPropertyMetadata } from "@local/hash-graph-sdk/entity";
import { getSimplifiedAiFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  FailedEntityProposal,
  PersistedEntityMetadata,
  ProposedEntityWithResolvedLinks,
  StoredPayloadRef,
} from "@local/hash-isomorphic-utils/flows/types";
import { StatusCode } from "@local/status";

import {
  fileEntityTypeIds,
  persistEntityAction,
} from "./persist-entity-action.js";

export const persistEntitiesAction: AiFlowActionActivity<
  "persistEntities"
> = async ({ inputs }) => {
  const { draft, proposedEntities: proposedEntitiesInput } =
    getSimplifiedAiFlowActionInputs({
      inputs,
      actionType: "persistEntities",
    });

  // The input may be a stored reference - resolve it if so
  const proposedEntities = await resolveArrayPayloadValue(
    getStorageProvider(),
    "ProposedEntity",
    proposedEntitiesInput,
  );

  /**
   * Sort the entities to persist in dependency order:
   * 1. Files first, because we might need to refer to them as a provenance source for other entities.
   * 2. Non-link entities before link entities, because we can't create a link entity without the entities it links to.
   */
  const entitiesWithDependenciesSortedLast = proposedEntities.toSorted(
    (a, b) => {
      const isAFileEntity = a.entityTypeIds.some((entityTypeId) =>
        fileEntityTypeIds.includes(entityTypeId),
      );
      const isBFileEntity = b.entityTypeIds.some((entityTypeId) =>
        fileEntityTypeIds.includes(entityTypeId),
      );
      if (isAFileEntity && !isBFileEntity) {
        return -1;
      } else if (isBFileEntity && !isAFileEntity) {
        return 1;
      }

      /**
       * This assumes that there are no link entities which link to other link entities, which require being able to
       * create multiple entities at once in a single transaction (since they refer to each other).
       *
       * @todo handle links pointing to other links via creating many entities at once, unblocked by H-1178. See also entity-result-table
       */
      if (
        (a.sourceEntityId && b.sourceEntityId) ||
        (!a.sourceEntityId && !b.sourceEntityId)
      ) {
        return 0;
      }

      if (a.sourceEntityId) {
        return 1;
      }

      return -1;
    },
  );

  const persistedFilesByOriginalUrl: Record<string, PersistedEntityMetadata> =
    {};

  const failedEntitiesByLocalId: Record<EntityId, FailedEntityProposal> = {};

  const persistedEntitiesByLocalId: Record<EntityId, PersistedEntityMetadata> =
    {};

  /**
   * We could potentially parallelize the creation of (a) non-link entities and then (b) link entities in batches,
   * if performance of this function becomes an issue.
   *
   * We need to create the links after all the non-links as the ids of the links may change,
   * if an existing entity is found to update rather than a new one with the localId being created.
   */
  for (const unresolvedEntity of entitiesWithDependenciesSortedLast) {
    const {
      claims,
      entityTypeIds,
      localEntityId,
      properties,
      provenance,
      propertyMetadata,
      sourceEntityId,
      targetEntityId,
    } = unresolvedEntity;

    const entityWithResolvedLinks: ProposedEntityWithResolvedLinks = {
      claims,
      entityTypeIds,
      localEntityId,
      properties,
      propertyMetadata,
      provenance,
    };

    if (sourceEntityId ?? targetEntityId) {
      if (!sourceEntityId || !targetEntityId) {
        failedEntitiesByLocalId[unresolvedEntity.localEntityId] = {
          proposedEntity: unresolvedEntity,
          message: `Expected both sourceEntityLocalId and targetEntityLocalId to be set, but got sourceEntityId='${JSON.stringify(
            sourceEntityId,
          )}' and targetEntityId='${JSON.stringify(targetEntityId)}'`,
        };
        continue;
      }

      const leftEntityId =
        sourceEntityId.kind === "proposed-entity"
          ? persistedEntitiesByLocalId[sourceEntityId.localId]?.entityId
          : sourceEntityId.entityId;

      const rightEntityId =
        targetEntityId.kind === "proposed-entity"
          ? persistedEntitiesByLocalId[targetEntityId.localId]?.entityId
          : targetEntityId.entityId;

      if (!leftEntityId) {
        failedEntitiesByLocalId[unresolvedEntity.localEntityId] = {
          proposedEntity: unresolvedEntity,
          message: `Linked entity with sourceEntityId='${JSON.stringify(
            sourceEntityId,
          )}' has not been successfully persisted`,
        };
        continue;
      }

      if (!rightEntityId) {
        failedEntitiesByLocalId[unresolvedEntity.localEntityId] = {
          proposedEntity: unresolvedEntity,
          message: `Linked entity with targetEntityId='${JSON.stringify(
            targetEntityId,
          )}' has not been successfully persisted`,
        };
        continue;
      }

      entityWithResolvedLinks.linkData = { leftEntityId, rightEntityId };
    }

    const entitySources = [
      ...(entityWithResolvedLinks.provenance.sources ?? []),
      ...flattenPropertyMetadata(
        entityWithResolvedLinks.propertyMetadata,
      ).flatMap(({ metadata }) => metadata.provenance?.sources ?? []),
    ];

    for (const source of entitySources) {
      if (source.location?.uri && !source.entityId) {
        const persistedFile = persistedFilesByOriginalUrl[source.location.uri];
        if (persistedFile?.entityId) {
          source.entityId = persistedFile.entityId;
        }
      }
    }

    // Note: This is a direct function call (not through Temporal), so we pass
    // the actual value instead of a StoredPayloadRef. This bypasses the S3 storage
    // because the payload doesn't go through Temporal's serialization.
    const persistedEntityOutputs = await persistEntityAction({
      inputs: [
        {
          inputName: "draft",
          payload: { kind: "Boolean", value: draft ?? false },
        },
        {
          inputName: "proposedEntityWithResolvedLinks",
          payload: {
            kind: "ProposedEntityWithResolvedLinks",
            value: entityWithResolvedLinks,
          } as unknown as {
            kind: "ProposedEntityWithResolvedLinks";
            value: StoredPayloadRef<"ProposedEntityWithResolvedLinks">;
          },
        },
      ],
    });

    const output = persistedEntityOutputs.contents[0]?.outputs[0]?.payload;

    if (!output) {
      failedEntitiesByLocalId[unresolvedEntity.localEntityId] = {
        proposedEntity: unresolvedEntity,
        message:
          persistedEntityOutputs.message ??
          `No outputs returned when attempting to persist entity`,
      };
      continue;
    }

    if (Array.isArray(output.value)) {
      failedEntitiesByLocalId[unresolvedEntity.localEntityId] = {
        proposedEntity: unresolvedEntity,
        message: `Expected a single persisted entity, but received an array of length ${output.value.length}`,
      };
      continue;
    }

    if (persistedEntityOutputs.code !== StatusCode.Ok) {
      failedEntitiesByLocalId[unresolvedEntity.localEntityId] = {
        existingEntityId: output.value.entityId,
        proposedEntity: entityWithResolvedLinks,
        message: `${persistedEntityOutputs.code}: ${
          persistedEntityOutputs.message ?? `no further details available`
        }`,
      };
      continue;
    }

    persistedEntitiesByLocalId[unresolvedEntity.localEntityId] = output.value;
  }

  const persistedEntities = Object.values(persistedEntitiesByLocalId);

  return {
    /** @todo H-2604 have some kind of 'partially completed' status when reworking flow return codes */
    code:
      persistedEntities.length > 0
        ? StatusCode.Ok
        : proposedEntities.length > 0
          ? StatusCode.Internal
          : StatusCode.Ok,
    message:
      persistedEntities.length > 0
        ? `Persisted ${persistedEntities.length} entities`
        : proposedEntities.length > 0
          ? `Failed to persist ${Object.values(failedEntitiesByLocalId).length} entities`
          : `No entities to persist`,
    contents: [
      {
        outputs: [
          {
            outputName: "persistedEntities",
            payload: {
              kind: "PersistedEntitiesMetadata",
              value: {
                persistedEntities,
                failedEntityProposals: Object.values(failedEntitiesByLocalId),
              },
            },
          },
        ],
      },
    ],
  };
};
