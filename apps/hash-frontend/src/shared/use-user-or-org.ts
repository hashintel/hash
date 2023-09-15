import { useQuery } from "@apollo/client";
import { extractBaseUrl } from "@blockprotocol/type-system";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import {
  AccountGroupId,
  AccountId,
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

export const useUserOrOrg = (
  params: {
    graphResolveDepths?: Partial<GraphResolveDepths>;
    temporalAxes?: QueryTemporalAxesUnresolved;
  } & (
    | { shortname: string }
    | { accountOrAccountGroupId: AccountId | AccountGroupId }
  ),
) => {
  const { data, loading } = useQuery<
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
                {
                  equal: [
                    { path: ["type", "versionedUrl"] },
                    { parameter: types.entityType.user.entityTypeId },
                  ],
                },
                {
                  equal: [
                    { path: ["type", "versionedUrl"] },
                    { parameter: types.entityType.org.entityTypeId },
                  ],
                },
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
    fetchPolicy: "cache-and-network",
  });

  return useMemo(() => {
    const rootEntity = data
      ? getRoots(data.structuralQueryEntities)[0]
      : undefined;

    return {
      userOrOrg: userOrOrgS,
      loading,
    };
  }, [data, loading]);
};
