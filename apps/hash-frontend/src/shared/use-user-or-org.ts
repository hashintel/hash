import { useQuery } from "@apollo/client";
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
import type { OrganizationProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import type { UserProperties } from "@local/hash-isomorphic-utils/system-types/user";
import type {
  Entity,
  EntityRootType,
  GraphResolveDepths,
  QueryTemporalAxesUnresolved,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
} from "../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../graphql/queries/knowledge/entity.queries";
import { isEntityOrgEntity, isEntityUserEntity } from "../lib/user-and-org";
import { AccountGroupId, AccountId } from "@local/hash-graph-types/account";

export const useUserOrOrg = (
  params: {
    includePermissions?: boolean;
    graphResolveDepths?: Partial<GraphResolveDepths>;
    temporalAxes?: QueryTemporalAxesUnresolved;
  } & (
    | { shortname?: string }
    | { accountOrAccountGroupId?: AccountId | AccountGroupId }
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
        temporalAxes: params.temporalAxes
          ? params.temporalAxes
          : currentTimeInstantTemporalAxes,
        includeDrafts: false,
      },
    },
    skip: !("accountOrAccountGroupId" in params) && !("shortname" in params),
    fetchPolicy: "network-only",
  });

  return useMemo(() => {
    const subgraph = data
      ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
          data.getEntitySubgraph.subgraph,
        )
      : undefined;

    const rootEntity = subgraph
      ? getRoots(subgraph).reduce<
          Entity<OrganizationProperties> | Entity<UserProperties> | undefined
        >((prev, currentEntity) => {
          if (
            !isEntityUserEntity(currentEntity) &&
            !isEntityOrgEntity(currentEntity)
          ) {
            throw new Error(
              `Entity with type ${currentEntity.metadata.entityTypeId} is not a user or an org entity`,
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
      ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
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
