import type { GraphApi } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  UserSecretProperties,
  UsesUserSecretProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import type {
  AccountId,
  Entity,
  EntityId,
  EntityRootType,
} from "@local/hash-subgraph";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import {
  getEntityRevision,
  getRoots,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";

export const getSecretEntitiesForIntegration = async ({
  authentication,
  graphApi,
  integrationEntityId,
}: {
  authentication: {
    actorId: AccountId;
  };
  graphApi: GraphApi;
  integrationEntityId: EntityId;
}): Promise<
  {
    usesUserSecretLink: Entity<UsesUserSecretProperties>;
    userSecret: Entity<UserSecretProperties>;
  }[]
> => {
  return await graphApi
    .getEntitiesByQuery(authentication.actorId, {
      query: {
        filter: {
          all: [
            generateVersionedUrlMatchingFilter(
              systemLinkEntityTypes.usesUserSecret.linkEntityTypeId,
              {
                ignoreParents: true,
              },
            ),
            {
              equal: [
                { path: ["leftEntity", "uuid"] },
                {
                  parameter: extractEntityUuidFromEntityId(integrationEntityId),
                },
              ],
            },
            {
              equal: [
                { path: ["rightEntity", "type", "versionedUrl"] },
                {
                  parameter: systemEntityTypes.userSecret.entityTypeId,
                },
              ],
            },
            { equal: [{ path: ["archived"] }, { parameter: false }] },
          ],
        },
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          hasRightEntity: { incoming: 0, outgoing: 1 },
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
      },
    })
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(
        data.subgraph,
      );

      const linkEntities = getRoots(subgraph);

      const linkAndSecretPairs: {
        usesUserSecretLink: Entity<UsesUserSecretProperties>;
        userSecret: Entity<UserSecretProperties>;
      }[] = [];

      for (const link of linkEntities) {
        if (
          link.metadata.entityTypeId !==
          systemLinkEntityTypes.usesUserSecret.linkEntityTypeId
        ) {
          throw new Error(
            `Unexpected entity type ${link.metadata.entityTypeId} in getSecretsForAccount subgraph`,
          );
        }

        if (!link.linkData) {
          throw new Error(
            `Link entity ${link.metadata.recordId.entityId} is missing link data`,
          );
        }

        const target = getEntityRevision(subgraph, link.linkData.rightEntityId);

        if (!target) {
          throw new Error(
            `Link entity ${link.metadata.recordId.entityId} references missing target entity ${link.linkData.rightEntityId}`,
          );
        }

        if (
          target.metadata.entityTypeId !==
          systemEntityTypes.userSecret.entityTypeId
        ) {
          throw new Error(
            `Unexpected entity type ${target.metadata.entityTypeId} in getSecretsForAccount subgraph`,
          );
        }

        linkAndSecretPairs.push({
          usesUserSecretLink: link,
          userSecret: target as Entity<UserSecretProperties>,
        });
      }

      return linkAndSecretPairs;
    });
};
