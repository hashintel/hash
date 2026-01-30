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
import {
  HashEntity,
  HashLinkEntity,
  queryEntities,
} from "@local/hash-graph-sdk/entity";
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
  queryEntities({ graphApi: params.graphApiClient }, params.authentication, {
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
              path: ["properties", linearPropertyTypes.id.propertyTypeBaseUrl],
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
    includePermissions: false,
  }).then(({ entities }) => entities);

export const getEntityOutgoingLinks = async (params: {
  graphApiClient: GraphApi;
  authentication: { actorId: ActorEntityUuid };
  entityId: EntityId;
  includeDrafts?: boolean;
}) => {
  const { graphApiClient, authentication, entityId } = params;

  const response = await queryEntities(
    { graphApi: graphApiClient },
    authentication,
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
      includePermissions: false,
    },
  );

  const outgoingLinkEntities = response.entities.map(
    (entity) => new HashLinkEntity(new HashEntity(entity)),
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

  const {
    entities: [entity, ...unexpectedEntities],
  } = await queryEntities({ graphApi: graphApiClient }, authentication, {
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
    includePermissions: false,
  });

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
