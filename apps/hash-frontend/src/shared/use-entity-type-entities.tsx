import { useQuery } from "@apollo/client";
import { VersionedUrl } from "@blockprotocol/type-system";
import {
  currentTimeInstantTemporalAxes,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  BaseUrl,
  EntityRootType,
  GraphResolveDepths,
  OwnedById,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import {
  QueryEntitiesQueryVariables,
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../graphql/api-types.gen";
import {
  queryEntitiesQuery,
  structuralQueryEntitiesQuery,
} from "../graphql/queries/knowledge/entity.queries";
import { apolloClient } from "../lib/apollo-client";
import { EntityTypeEntitiesContextValue } from "./entity-type-entities-context";

export const generateUseEntityTypeEntitiesQueryVariables = (params: {
  ownedById?: OwnedById;
  entityTypeBaseUrl?: BaseUrl;
  entityTypeId?: VersionedUrl;
  graphResolveDepths?: Partial<GraphResolveDepths>;
}): QueryEntitiesQueryVariables => ({
  operation: {
    multiFilter: {
      filters: [
        ...(params.ownedById
          ? [
              {
                field: ["ownedById"],
                operator: "EQUALS" as const,
                value: params.ownedById,
              },
            ]
          : []),
        ...(params.entityTypeBaseUrl
          ? [
              {
                field: ["metadata", "entityTypeBaseUrl"],
                operator: "EQUALS" as const,
                value: params.entityTypeBaseUrl,
              },
            ]
          : params.entityTypeId
            ? [
                {
                  field: ["metadata", "entityTypeId"],
                  operator: "EQUALS" as const,
                  value: params.entityTypeId,
                },
              ]
            : []),
      ],
      operator: "AND",
    },
  },
  ...zeroedGraphResolveDepths,
  ...params.graphResolveDepths,
  includePermissions: false,
});

export const useEntityTypeEntities = (params: {
  entityTypeBaseUrl?: BaseUrl;
  entityTypeId?: VersionedUrl;
  ownedById?: OwnedById;
  graphResolveDepths?: Partial<GraphResolveDepths>;
  includeDrafts?: boolean;
}): EntityTypeEntitiesContextValue => {
  const {
    entityTypeBaseUrl,
    entityTypeId,
    ownedById,
    graphResolveDepths,
    includeDrafts = false,
  } = params;

  const variables = useMemo<StructuralQueryEntitiesQueryVariables>(
    () => ({
      query: {
        filter: {
          all: [
            ...(ownedById
              ? [
                  {
                    equal: [{ path: ["ownedById"] }, { parameter: ownedById }],
                  },
                ]
              : []),
            ...(entityTypeBaseUrl
              ? [
                  {
                    equal: [
                      { path: ["metadata", "entityTypeBaseUrl"] },
                      { parameter: entityTypeBaseUrl },
                    ],
                  },
                ]
              : entityTypeId
                ? [
                    {
                      equal: [
                        { path: ["metadata", "entityTypeId"] },
                        { parameter: entityTypeId },
                      ],
                    },
                  ]
                : []),
          ],
        },
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          ...graphResolveDepths,
        },
        includeDrafts,
        temporalAxes: currentTimeInstantTemporalAxes,
      },
      includePermissions: false,
    }),
    [
      entityTypeBaseUrl,
      graphResolveDepths,
      entityTypeId,
      ownedById,
      includeDrafts,
    ],
  );

  const { data, loading, refetch } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    fetchPolicy: "cache-and-network",
    variables,
  });

  const hadCachedContent = useMemo(
    () => !!apolloClient.readQuery({ query: queryEntitiesQuery, variables }),
    [variables],
  );

  const subgraph = data?.structuralQueryEntities.subgraph
    ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
        data.structuralQueryEntities.subgraph,
      )
    : undefined;

  const entities = useMemo(
    () => (subgraph ? getRoots(subgraph) : undefined),
    [subgraph],
  );

  return {
    entityTypeBaseUrl,
    entityTypeId,
    entities,
    hadCachedContent,
    loading,
    refetch,
    subgraph,
  };
};
