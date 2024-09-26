import { Entity, flattenPropertyMetadata } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import { getSimplifiedActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  FailedEntityProposal,
  PersistedEntities,
  PersistedEntity,
  ProposedEntityWithResolvedLinks,
} from "@local/hash-isomorphic-utils/flows/types";
import { StatusCode } from "@local/status";

import {
  fileEntityTypeIds,
  persistEntityAction,
} from "./persist-entity-action.js";
import type { FlowActionActivity } from "./types.js";

export const persistEntitiesAction: FlowActionActivity = async ({ inputs }) => {
  const { draft, proposedEntities } = getSimplifiedActionInputs({
    inputs,
    actionType: "persistEntities",
  });

  /**
   * Sort the entities to persist in dependency order:
   * 1. Files first, because we might need to refer to them as a provenance source for other entities.
   * 2. Non-link entities before link entities, because we can't create a link entity without the entities it links to.
   */
  const entitiesWithDependenciesSortedLast = proposedEntities.toSorted(
    (a, b) => {
      const isAFileEntity = fileEntityTypeIds.includes(a.entityTypeId);
      const isBFileEntity = fileEntityTypeIds.includes(b.entityTypeId);
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

  const persistedFilesByOriginalUrl: Record<string, PersistedEntity> = {};

  const failedEntitiesByLocalId: Record<
    EntityId,
    Omit<FailedEntityProposal, "existingEntity"> & { existingEntity?: Entity }
  > = {};
  const persistedEntitiesByLocalId: Record<
    EntityId,
    Omit<PersistedEntity, "entity"> & { entity?: Entity }
  > = {};

  /**
   * We could potentially parallelize the creation of (a) non-link entities and (b) link entities,
   * if performance of this function becomes an issue.
   */
  for (const unresolvedEntity of entitiesWithDependenciesSortedLast) {
    const {
      claims,
      entityTypeId,
      localEntityId,
      properties,
      provenance,
      propertyMetadata,
      sourceEntityId,
      targetEntityId,
    } = unresolvedEntity;

    const entityWithResolvedLinks: ProposedEntityWithResolvedLinks = {
      claims,
      entityTypeId,
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
          ? persistedEntitiesByLocalId[sourceEntityId.localId]?.entity?.metadata
              .recordId.entityId
          : sourceEntityId.entityId;

      const rightEntityId =
        targetEntityId.kind === "proposed-entity"
          ? persistedEntitiesByLocalId[targetEntityId.localId]?.entity?.metadata
              .recordId.entityId
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
        if (persistedFile?.entity) {
          source.entityId = new Entity(persistedFile.entity).entityId;
        }
      }
    }

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
          },
        },
      ],
    });

    const output = persistedEntityOutputs.contents[0]?.outputs?.[0]?.payload;

    if (output && output.kind !== "PersistedEntity") {
      failedEntitiesByLocalId[unresolvedEntity.localEntityId] = {
        proposedEntity: unresolvedEntity,
        message: `Unexpected output kind ${output.kind}`,
      };
      continue;
    }

    if (!output) {
      failedEntitiesByLocalId[unresolvedEntity.localEntityId] = {
        proposedEntity: unresolvedEntity,
        message: `No outputs returned when attempting to persist entity`,
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
        ...output.value,
        existingEntity: output.value.existingEntity
          ? new Entity(output.value.existingEntity)
          : undefined,
        proposedEntity: entityWithResolvedLinks,
        message: `${persistedEntityOutputs.code}: ${
          persistedEntityOutputs.message ?? `no further details available`
        }`,
      };
      continue;
    }

    persistedEntitiesByLocalId[unresolvedEntity.localEntityId] = {
      ...output.value,
      entity: output.value.entity ? new Entity(output.value.entity) : undefined,
    };
  }

  const persistedEntities = Object.values(persistedEntitiesByLocalId).map(
    (persisted) => ({
      ...persisted,
      entity: persisted.entity?.toJSON(),
    }),
  );
  const failedEntityProposals = Object.values(failedEntitiesByLocalId).map(
    (failed) => ({
      ...failed,
      existingEntity: failed.existingEntity?.toJSON(),
    }),
  );

  return {
    /** @todo H-2604 have some kind of 'partially completed' status when reworking flow return codes */
    code: persistedEntities.length > 0 ? StatusCode.Ok : StatusCode.Internal,
    contents: [
      {
        outputs: [
          {
            outputName: "persistedEntities",
            payload: {
              kind: "PersistedEntities",
              value: {
                persistedEntities,
                failedEntityProposals,
              } satisfies PersistedEntities,
            },
          },
        ],
      },
    ],
  };
};
