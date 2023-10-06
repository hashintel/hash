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

export const useUserOrOrg = (
  params: {
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
          data.structuralQueryEntities as Subgraph<EntityRootType>,
        ).reduce<Entity<OrgProperties> | Entity<UserProperties> | undefined>(
          (prev, current) => {
            const currentUserOrOrgEntity = current as
              | Entity<OrgProperties>
              | Entity<UserProperties>;

            if (!prev) {
              return currentUserOrOrgEntity;
            }

            if (
              prev.metadata.temporalVersioning.decisionTime.start.limit <
              current.metadata.temporalVersioning.decisionTime.start.limit
            ) {
              return currentUserOrOrgEntity;
            }
            return prev;
          },
          undefined,
        )
      : undefined;

    return {
      userOrOrgSubgraph: data?.structuralQueryEntities as
        | Subgraph<EntityRootType>
        | undefined,
      userOrOrg: rootEntity,
      loading,
      refetch,
    };
  }, [data, loading, refetch]);
};
