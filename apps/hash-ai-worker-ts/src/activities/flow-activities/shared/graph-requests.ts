import type { GraphApi } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type {
  AccountId,
  Entity,
  EntityId,
  EntityRootType,
} from "@local/hash-subgraph";
import { splitEntityId } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";

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

  const response = await graphApiClient.getEntitiesByQuery(
    authentication.actorId,
    {
      query: {
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

export const archiveEntity = async (params: {
  graphApiClient: GraphApi;
  authentication: { actorId: AccountId };
  entity: Entity;
}) => {
  const { graphApiClient, authentication, entity } = params;
  await graphApiClient.patchEntity(authentication.actorId, {
    entityId: entity.metadata.recordId.entityId,
    archived: true,
  });
};
