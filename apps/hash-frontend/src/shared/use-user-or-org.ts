import { useQuery } from "@apollo/client";
import { extractBaseUrl } from "@blockprotocol/type-system";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-graphql-shared/graphql/types";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemTypes } from "@local/hash-isomorphic-utils/ontology-types";
import {
  OrgProperties,
  UserProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import {
  AccountGroupId,
  AccountId,
  Entity,
  EntityRootType,
  GraphResolveDepths,
  QueryTemporalAxesUnresolved,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import {
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../graphql/queries/knowledge/entity.queries";
import { isEntityOrgEntity, isEntityUserEntity } from "../lib/user-and-org";

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
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: {
      includePermissions: params.includePermissions ?? false,
      query: {
        filter: {
          all: [
            ...("shortname" in params
              ? [
                  {
                    equal: [
                      {
                        path: [
                          "properties",
                          extractBaseUrl(
                            systemTypes.propertyType.shortname.propertyTypeId,
                          ),
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
                  systemTypes.entityType.user.entityTypeId,
                  { ignoreParents: true },
                ),
                generateVersionedUrlMatchingFilter(
                  systemTypes.entityType.org.entityTypeId,
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
      },
    },
    skip: !("accountOrAccountGroupId" in params) && !("shortname" in params),
    fetchPolicy: "network-only",
  });

  return useMemo(() => {
    const subgraph = data
      ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
          data.structuralQueryEntities.subgraph,
        )
      : undefined;

    const rootEntity = subgraph
      ? getRoots(subgraph).reduce<
          Entity<OrgProperties> | Entity<UserProperties> | undefined
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
          data.structuralQueryEntities.subgraph,
        )
      : undefined;

    return {
      canUserEdit: !!(
        rootEntity &&
        data?.structuralQueryEntities.userPermissionsOnEntities?.[
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
