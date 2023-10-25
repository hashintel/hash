import { useQuery } from "@apollo/client";
import { extractBaseUrl } from "@blockprotocol/type-system";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
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
  Subgraph,
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
    | { shortname: string }
    | { accountOrAccountGroupId: AccountId | AccountGroupId }
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
            "shortname" in params
              ? {
                  equal: [
                    {
                      path: [
                        "properties",
                        extractBaseUrl(
                          types.propertyType.shortname.propertyTypeId,
                        ),
                      ],
                    },
                    { parameter: params.shortname },
                  ],
                }
              : {
                  equal: [
                    { path: ["uuid"] },
                    { parameter: params.accountOrAccountGroupId },
                  ],
                },
            {
              any: [
                generateVersionedUrlMatchingFilter(
                  types.entityType.user.entityTypeId,
                  { ignoreParents: true },
                ),
                generateVersionedUrlMatchingFilter(
                  types.entityType.org.entityTypeId,
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
    fetchPolicy: "network-only",
  });

  return useMemo(() => {
    const rootEntity = data
      ? getRoots(
          data.structuralQueryEntities.subgraph as Subgraph<EntityRootType>,
        ).reduce<Entity<OrgProperties> | Entity<UserProperties> | undefined>(
          (prev, currentEntity) => {
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
          },
          undefined,
        )
      : undefined;

    return {
      canUserEdit: !!(
        rootEntity &&
        data?.structuralQueryEntities.userPermissionsOnEntities?.[
          rootEntity.metadata.recordId.entityId
        ]?.edit
      ),
      userOrOrgSubgraph: data?.structuralQueryEntities.subgraph as
        | Subgraph<EntityRootType>
        | undefined,
      userOrOrg: rootEntity,
      loading,
      refetch,
    };
  }, [data, loading, refetch]);
};
