import type {
  ActorEntityUuid,
  EntityId,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import {
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
  splitEntityId,
} from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import { type HashEntity, HashLinkEntity } from "@local/hash-graph-sdk/entity";
import { mapGraphApiEntityToEntity } from "@local/hash-graph-sdk/subgraph";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { linearPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

export const getEntitiesByLinearId = async (params: {
  graphApiClient: GraphApi;
  authentication: { actorId: ActorEntityUuid };
  linearId: string;
  entityTypeId?: VersionedUrl;
  webWebId?: WebId;
  includeDrafts?: boolean;
}): Promise<HashEntity[]> =>
  params.graphApiClient
    .queryEntities(params.authentication.actorId, {
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
          params.webWebId
            ? {
                equal: [
                  {
                    path: ["webId"],
                  },
                  { parameter: params.webWebId },
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
  authentication: { actorId: ActorEntityUuid };
  entityId: EntityId;
  includeDrafts?: boolean;
}) => {
  const { graphApiClient, authentication, entityId } = params;

  const { data: response } = await graphApiClient.queryEntities(
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
              { path: ["leftEntity", "webId"] },
              {
                parameter: extractWebIdFromEntityId(entityId),
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

  const outgoingLinkEntities = response.entities.map(
    (entity) =>
      new HashLinkEntity(
        mapGraphApiEntityToEntity(entity, authentication.actorId),
      ),
  );

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
  authentication: { actorId: ActorEntityUuid };
  entityId: EntityId;
  includeDrafts?: boolean;
}) => {
  const { graphApiClient, authentication, entityId } = params;

  const [webId, entityUuid] = splitEntityId(entityId);

  const { data: response } = await graphApiClient.queryEntities(
    authentication.actorId,
    {
      filter: {
        all: [
          {
            equal: [{ path: ["uuid"] }, { parameter: entityUuid }],
          },
          {
            equal: [{ path: ["webId"] }, { parameter: webId }],
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
