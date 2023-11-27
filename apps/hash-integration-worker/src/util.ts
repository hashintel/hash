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
}): Promise<Entity[]> => {
  const entities = await params.graphApiClient
    .getEntitiesByQuery(params.authentication.actorId, {
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
    })
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(data);
      return getRoots(subgraph);
    });

  return entities;
};

export const getEntityOutgoingLinks = async (params: {
  graphApiClient: GraphApi;
  authentication: { actorId: AccountId };
  entityId: EntityId;
}) => {
  const { graphApiClient, authentication, entityId } = params;

  const response = await graphApiClient.getEntitiesByQuery(
    authentication.actorId,
    {
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
    },
  );

  const outgoingLinkEntitiesSubgraph =
    mapGraphApiSubgraphToSubgraph<EntityRootType>(response.data);

  const outgoingLinkEntities = getRoots(
    outgoingLinkEntitiesSubgraph,
  ) as LinkEntity[];

  return outgoingLinkEntities;
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
  });
};
