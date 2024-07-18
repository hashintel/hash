import { typedEntries } from "@local/advanced-types/typed-entries";
import type { GraphApi } from "@local/hash-graph-client";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";
import type {
  EntityId,
  PropertyObjectWithMetadata,
  PropertyPatchOperation,
} from "@local/hash-graph-types/entity";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { EntityRootType } from "@local/hash-subgraph";
import {
  extractDraftIdFromEntityId,
  splitEntityId,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import isEqual from "lodash.isequal";
import isMatch from "lodash.ismatch";

/**
 * @todo: move the primitive node helper methods from the Node API into a shared
 * package so that they can be used without importing from the Node API directly.
 *
 * @see https://linear.app/hash/issue/H-1458/move-primitive-node-api-helper-methods-into-shared-package-to-make
 */

export const getLatestEntityById = async (params: {
  graphApiClient: GraphApi;
  authentication: { actorId: AccountId };
  entityId: EntityId;
  includeDrafts?: boolean;
}) => {
  const { graphApiClient, authentication, entityId } = params;

  const [ownedById, entityUuid] = splitEntityId(entityId);

  const response = await graphApiClient.getEntitySubgraph(
    authentication.actorId,
    {
      filter: {
        all: [
          {
            equal: [{ path: ["uuid"] }, { parameter: entityUuid }],
          },
          {
            equal: [{ path: ["ownedById"] }, { parameter: ownedById }],
          },
          { equal: [{ path: ["archived"] }, { parameter: false }] },
        ],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: params.includeDrafts ?? false,
    },
  );

  const entitiesSubgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(
    response.data.subgraph,
    authentication.actorId,
  );

  const [entity, ...unexpectedEntities] = getRoots(entitiesSubgraph);

  if (unexpectedEntities.length > 0) {
    throw new Error(
      `Critical: Latest entity with entityId ${entityId} returned more than one result.`,
    );
  }

  if (!entity) {
    throw new Error(
      `Critical: Entity with entityId ${entityId} doesn't exist or cannot be accessed by requesting user.`,
    );
  }

  return entity;
};

export const getEntityUpdate = <T extends PropertyObjectWithMetadata>({
  existingEntity,
  newProperties,
}: {
  existingEntity: Entity;
  newProperties: T;
}) => {
  const patchOperations: PropertyPatchOperation[] = [];

  const isExactMatch = isMatch(existingEntity.properties, newProperties);

  if (!isExactMatch) {
    for (const [key, property] of typedEntries(newProperties.value)) {
      // @todo better handle property objects, will currently overwrite the entire object if there are any differences
      if (!isEqual(existingEntity.properties[key], property)) {
        patchOperations.push({
          op: existingEntity.properties[key] ? "replace" : "add",
          path: [key],
          property,
        });
      }
    }
  }

  const existingEntityIsDraft = !!extractDraftIdFromEntityId(
    existingEntity.metadata.recordId.entityId,
  );

  return {
    existingEntityIsDraft,
    isExactMatch,
    patchOperations,
  };
};
