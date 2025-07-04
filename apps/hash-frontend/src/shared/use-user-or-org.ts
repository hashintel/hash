import { useQuery } from "@apollo/client";
import type { EntityRootType, GraphResolveDepths } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type {
  ActorEntityUuid,
  ActorGroupEntityUuid,
  Entity,
} from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { Organization } from "@local/hash-isomorphic-utils/system-types/shared";
import type { User } from "@local/hash-isomorphic-utils/system-types/user";
import { useMemo } from "react";

import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
} from "../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../graphql/queries/knowledge/entity.queries";
import { isEntityOrgEntity, isEntityUserEntity } from "../lib/user-and-org";

export const useUserOrOrg = (
  params: {
    includePermissions?: boolean;
    graphResolveDepths?: Partial<GraphResolveDepths>;
  } & (
    | { shortname?: string }
    | { accountOrAccountGroupId?: ActorEntityUuid | ActorGroupEntityUuid }
  ),
) => {
  const { data, loading, refetch } = useQuery<
    GetEntitySubgraphQuery,
    GetEntitySubgraphQueryVariables
  >(getEntitySubgraphQuery, {
    variables: {
      includePermissions: params.includePermissions ?? false,
      request: {
        filter: {
          all: [
            ...("shortname" in params
              ? [
                  {
                    equal: [
                      {
                        path: [
                          "properties",
                          systemPropertyTypes.shortname.propertyTypeBaseUrl,
                        ],
                      },
                      { parameter: params.shortname },
                    ],
                  },
                ]
              : "accountOrAccountGroupId" in params
                ? [
                    {
                      equal: [
                        { path: ["uuid"] },
                        { parameter: params.accountOrAccountGroupId },
                      ],
                    },
                  ]
                : []),
            {
              any: [
                generateVersionedUrlMatchingFilter(
                  systemEntityTypes.user.entityTypeId,
                  { ignoreParents: true },
                ),
                generateVersionedUrlMatchingFilter(
                  systemEntityTypes.organization.entityTypeId,
                  { ignoreParents: true },
                ),
              ],
            },
          ],
        },
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          ...params.graphResolveDepths,
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
      },
    },
    skip:
      !(
        "accountOrAccountGroupId" in params && params.accountOrAccountGroupId
      ) && !("shortname" in params && params.shortname),
    fetchPolicy: "cache-and-network",
  });

  return useMemo(() => {
    const subgraph = data
      ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType<HashEntity>>(
          data.getEntitySubgraph.subgraph,
        )
      : undefined;

    const rootEntity = subgraph
      ? getRoots(subgraph).reduce<
          Entity<Organization> | Entity<User> | undefined
        >((prev, currentEntity) => {
          if (
            !isEntityUserEntity(currentEntity) &&
            !isEntityOrgEntity(currentEntity)
          ) {
            throw new Error(
              `Entity with type(s) ${currentEntity.metadata.entityTypeIds.join(", ")} is not a user or an org entity`,
            );
          }

          if (!prev) {
            return currentEntity;
          }

          if (
            prev.metadata.temporalVersioning.decisionTime.start.limit <
            currentEntity.metadata.temporalVersioning.decisionTime.start.limit
          ) {
            return currentEntity;
          }
          return prev;
        }, undefined)
      : undefined;

    const userOrOrgSubgraph = data
      ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType<HashEntity>>(
          data.getEntitySubgraph.subgraph,
        )
      : undefined;

    return {
      canUserEdit: !!(
        rootEntity &&
        data?.getEntitySubgraph.userPermissionsOnEntities?.[
          rootEntity.metadata.recordId.entityId
        ]?.edit
      ),
      userOrOrgSubgraph,
      userOrOrg: rootEntity,
      loading,
      refetch,
    };
  }, [data, loading, refetch]);
};
