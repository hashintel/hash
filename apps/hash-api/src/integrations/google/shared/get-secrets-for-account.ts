import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  UserSecretProperties,
  UsesUserSecretProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import {
  AccountId,
  Entity,
  EntityId,
  extractEntityUuidFromEntityId,
} from "@local/hash-subgraph";
import { getEntityRevision, getRoots } from "@local/hash-subgraph/stdlib";

import { ImpureGraphFunction } from "../../../graph/context-types";
import { getEntities } from "../../../graph/knowledge/primitive/entity";

export const getSecretsForAccount: ImpureGraphFunction<
  { userAccountId: AccountId; googleAccountEntityId: EntityId },
  Promise<
    {
      usesUserSecretLink: Entity<UsesUserSecretProperties>;
      userSecret: Entity<UserSecretProperties>;
    }[]
  >
> = async (context, authentication, params) => {
  return await getEntities(context, authentication, {
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
                parameter: extractEntityUuidFromEntityId(
                  params.googleAccountEntityId,
                ),
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
  }).then((subgraph) => {
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
