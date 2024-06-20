import { useQuery } from "@apollo/client";
import type { VersionedUrl } from "@blockprotocol/type-system";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import {
  currentTimeInstantTemporalAxes,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { EntityRootType, GraphResolveDepths } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
  QueryEntitiesQueryVariables,
} from "../graphql/api-types.gen";
import {
  getEntitySubgraphQuery,
  queryEntitiesQuery,
} from "../graphql/queries/knowledge/entity.queries";
import { apolloClient } from "../lib/apollo-client";
import type { EntityTypeEntitiesContextValue } from "./entity-type-entities-context";

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
}): EntityTypeEntitiesContextValue => {
  const { entityTypeBaseUrl, entityTypeId, ownedById, graphResolveDepths } =
    params;

  const variables = useMemo<GetEntitySubgraphQueryVariables>(
    () => ({
      request: {
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
                      { path: ["type", "baseUrl"] },
                      { parameter: entityTypeBaseUrl },
                    ],
                  },
                ]
              : entityTypeId
                ? [
                    {
                      equal: [
                        { path: ["type", "versionedUrl"] },
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
        includeDrafts: false,
        temporalAxes: currentTimeInstantTemporalAxes,
      },
      includePermissions: false,
    }),
    [entityTypeBaseUrl, graphResolveDepths, entityTypeId, ownedById],
  );

  const { data, loading, refetch } = useQuery<
    GetEntitySubgraphQuery,
    GetEntitySubgraphQueryVariables
  >(getEntitySubgraphQuery, {
    fetchPolicy: "cache-and-network",
    variables,
  });

  const hadCachedContent = useMemo(
    () => !!apolloClient.readQuery({ query: queryEntitiesQuery, variables }),
    [variables],
  );

  const subgraph = useMemo(
    () =>
      data?.getEntitySubgraph.subgraph
        ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
            data.getEntitySubgraph.subgraph,
          )
        : undefined,
    [data?.getEntitySubgraph.subgraph],
  );

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
