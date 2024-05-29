import type { VersionedUrl } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type { AccountId } from "@local/hash-graph-types/account";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { linearPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { mapGraphApiEntityToEntity } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { Entity } from "@local/hash-subgraph";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
  splitEntityId,
} from "@local/hash-subgraph";
import type { LinkEntity } from "@local/hash-subgraph/type-system-patch";

export const getEntitiesByLinearId = async (params: {
  graphApiClient: GraphApi;
  authentication: { actorId: AccountId };
  linearId: string;
  entityTypeId?: VersionedUrl;
  webOwnedById?: OwnedById;
  includeDrafts?: boolean;
}): Promise<Entity[]> =>
  params.graphApiClient
    .getEntities(params.authentication.actorId, {
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
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: params.includeDrafts ?? false,
    })
    .then(({ data: response }) =>
      response.entities.map((entity) =>
        mapGraphApiEntityToEntity(entity, params.authentication.actorId),
      ),
    );

export const getEntityOutgoingLinks = async (params: {
  graphApiClient: GraphApi;
  authentication: { actorId: AccountId };
  entityId: EntityId;
  includeDrafts?: boolean;
}) => {
  const { graphApiClient, authentication, entityId } = params;

  const { data: response } = await graphApiClient.getEntities(
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
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: params.includeDrafts ?? false,
    },
  );

  const outgoingLinkEntities = response.entities.map((entity) =>
    mapGraphApiEntityToEntity(entity, authentication.actorId),
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

  const { data: response } = await graphApiClient.getEntities(
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
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: params.includeDrafts ?? false,
    },
  );

  const [entity, ...unexpectedEntities] = response.entities.map((graphEntity) =>
    mapGraphApiEntityToEntity(graphEntity, authentication.actorId),
  );

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
