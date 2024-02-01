import { VersionedUrl } from "@blockprotocol/type-system";
import { GraphApi } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { linearPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  AccountId,
  Entity,
  EntityId,
  EntityRootType,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
  OwnedById,
  splitEntityId,
} from "@local/hash-subgraph";
import {
  getRoots,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";
import { LinkEntity } from "@local/hash-subgraph/type-system-patch";

export const getEntitiesByLinearId = async (params: {
  graphApiClient: GraphApi;
  authentication: { actorId: AccountId };
  linearId: string;
  entityTypeId?: VersionedUrl;
  webOwnedById?: OwnedById;
  includeDrafts?: boolean;
}): Promise<Entity[]> => {
  const entities = await params.graphApiClient
    .getEntitiesByQuery(params.authentication.actorId, {
      query: {
        filter: {
          all: [
            params.entityTypeId
              ? generateVersionedUrlMatchingFilter(params.entityTypeId, {
                  ignoreParents: true,
                })
              : [],
            {
              equal: [
                {
                  path: [
                    "properties",
                    linearPropertyTypes.id.propertyTypeBaseUrl,
                  ],
                },
                { parameter: params.linearId },
              ],
            },
            params.webOwnedById
              ? {
                  equal: [
                    {
                      path: ["ownedById"],
                    },
                    { parameter: params.webOwnedById },
                  ],
                }
              : [],
          ].flat(),
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: params.includeDrafts ?? false,
      },
    })
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(
        data.subgraph,
      );
      return getRoots(subgraph);
    });

  return entities;
};

export const getEntityOutgoingLinks = async (params: {
  graphApiClient: GraphApi;
  authentication: { actorId: AccountId };
  entityId: EntityId;
  includeDrafts?: boolean;
}) => {
  const { graphApiClient, authentication, entityId } = params;

  const response = await graphApiClient.getEntitiesByQuery(
    authentication.actorId,
    {
      query: {
        filter: {
          all: [
            {
              equal: [
                { path: ["leftEntity", "uuid"] },
                {
                  parameter: extractEntityUuidFromEntityId(entityId),
                },
              ],
            },
            {
              equal: [
                { path: ["leftEntity", "ownedById"] },
                {
                  parameter: extractOwnedByIdFromEntityId(entityId),
                },
              ],
            },
            {
              equal: [{ path: ["archived"] }, { parameter: false }],
            },
          ],
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: params.includeDrafts ?? false,
      },
    },
  );

  const outgoingLinkEntitiesSubgraph =
    mapGraphApiSubgraphToSubgraph<EntityRootType>(response.data.subgraph);

  const outgoingLinkEntities = getRoots(
    outgoingLinkEntitiesSubgraph,
  ) as LinkEntity[];

  return outgoingLinkEntities;
};

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
  await graphApiClient.updateEntity(authentication.actorId, {
    entityId: entity.metadata.recordId.entityId,
    archived: true,
    /**
     * @todo: these fields shouldn't be required when archiving an entity
     *
     * @see https://app.asana.com/0/1201095311341924/1203285029221330/f
     * */
    entityTypeId: entity.metadata.entityTypeId,
    properties: entity.properties,
    draft: false,
  });
};
