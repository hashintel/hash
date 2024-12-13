import { useQuery } from "@apollo/client";
import type { VersionedUrl } from "@blockprotocol/type-system";
import type { EntityQueryCursor } from "@local/hash-graph-client";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import {
  currentTimeInstantTemporalAxes,
  ignoreNoisySystemTypesFilter,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { GetEntitySubgraphRequest } from "@local/hash-isomorphic-utils/types";
import type { EntityRootType, GraphResolveDepths } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
} from "../graphql/api-types.gen";
import {
  getEntitySubgraphQuery,
  queryEntitiesQuery,
} from "../graphql/queries/knowledge/entity.queries";
import { apolloClient } from "../lib/apollo-client";
import type { EntityTypeEntitiesContextValue } from "./entity-type-entities-context";

type UseEntityTypeEntitiesQueryParams = {
  cursor?: EntityQueryCursor;
  limit?: number;
  ownedById?: OwnedById;
  entityTypeBaseUrl?: BaseUrl;
  entityTypeId?: VersionedUrl;
  graphResolveDepths?: Partial<GraphResolveDepths>;
  sort?: GetEntitySubgraphRequest["sortingPaths"];
};

export const generateUseEntityTypeEntitiesQueryVariables = ({
  ownedById,
  entityTypeBaseUrl,
  entityTypeId,
  graphResolveDepths,
}: UseEntityTypeEntitiesQueryParams): GetEntitySubgraphQueryVariables => ({
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
        ...(!entityTypeId && !entityTypeBaseUrl
          ? [ignoreNoisySystemTypesFilter]
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
});

export const useEntityTypeEntities = (
  params: UseEntityTypeEntitiesQueryParams,
): EntityTypeEntitiesContextValue => {
  const { entityTypeBaseUrl, entityTypeId, ownedById, graphResolveDepths } =
    params;

  const variables = useMemo<GetEntitySubgraphQueryVariables>(
    () =>
      generateUseEntityTypeEntitiesQueryVariables({
        entityTypeBaseUrl,
        entityTypeId,
        ownedById,
        graphResolveDepths,
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
