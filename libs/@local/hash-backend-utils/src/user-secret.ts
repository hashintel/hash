import type { GraphApi } from "@local/hash-graph-client";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";
import type { EntityId } from "@local/hash-graph-types/entity";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { UsesUserSecret } from "@local/hash-isomorphic-utils/system-types/google/shared";
import type { UserSecret } from "@local/hash-isomorphic-utils/system-types/shared";
import type { EntityRootType } from "@local/hash-subgraph";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import { getEntityRevision, getRoots } from "@local/hash-subgraph/stdlib";

export const getSecretEntitiesForIntegration = async ({
  authentication,
  graphApiClient,
  integrationEntityId,
}: {
  authentication: {
    actorId: AccountId;
  };
  graphApiClient: GraphApi;
  integrationEntityId: EntityId;
}): Promise<
  {
    usesUserSecretLink: Entity<UsesUserSecret>;
    userSecret: Entity<UserSecret>;
  }[]
> => {
  return await graphApiClient
    .getEntitySubgraph(authentication.actorId, {
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
    })
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(
        data.subgraph,
        authentication.actorId,
      );

      const linkEntities = getRoots(subgraph);

      const linkAndSecretPairs: {
        usesUserSecretLink: Entity<UsesUserSecret>;
        userSecret: Entity<UserSecret>;
      }[] = [];

      for (const link of linkEntities) {
        if (
          !link.metadata.entityTypeIds.includes(
            systemLinkEntityTypes.usesUserSecret.linkEntityTypeId,
          )
        ) {
          throw new Error(
            `Unexpected entity type ${link.metadata.entityTypeIds.join(", ")} in getSecretsForAccount subgraph`,
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
          !target.metadata.entityTypeIds.includes(
            systemEntityTypes.userSecret.entityTypeId,
          )
        ) {
          throw new Error(
            `Unexpected entity type(s) ${target.metadata.entityTypeIds.join(", ")} in getSecretsForAccount subgraph`,
          );
        }

        linkAndSecretPairs.push({
          usesUserSecretLink: link as Entity<UsesUserSecret>,
          userSecret: target as Entity<UserSecret>,
        });
      }

      return linkAndSecretPairs;
    });
};
