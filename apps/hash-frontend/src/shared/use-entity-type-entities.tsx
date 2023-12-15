import { useQuery } from "@apollo/client";
import { VersionedUrl } from "@blockprotocol/type-system";
import {
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
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../graphql/api-types.gen";
import { queryEntitiesQuery } from "../graphql/queries/knowledge/entity.queries";
import { apolloClient } from "../lib/apollo-client";
import { EntityTypeEntitiesContextValue } from "./entity-type-entities-context";

export const useEntityTypeEntities = (params: {
  entityTypeBaseUrl?: BaseUrl;
  entityTypeId?: VersionedUrl;
  ownedById?: OwnedById;
  graphResolveDepths?: Partial<GraphResolveDepths>;
}): EntityTypeEntitiesContextValue => {
  const { entityTypeBaseUrl, entityTypeId, ownedById, graphResolveDepths } =
    params;

  const variables = useMemo<QueryEntitiesQueryVariables>(
    () => ({
      operation: {
        multiFilter: {
          filters: [
            ...(ownedById
              ? [
                  {
                    field: ["ownedById"],
                    operator: "EQUALS" as const,
                    value: ownedById,
                  },
                ]
              : []),
            ...(entityTypeBaseUrl
              ? [
                  {
                    field: ["metadata", "entityTypeBaseUrl"],
                    operator: "EQUALS" as const,
                    value: entityTypeBaseUrl,
                  },
                ]
              : entityTypeId
                ? [
                    {
                      field: ["metadata", "entityTypeId"],
                      operator: "EQUALS" as const,
                      value: entityTypeId,
                    },
                  ]
                : []),
          ],
          operator: "AND",
        },
      },
      ...zeroedGraphResolveDepths,
      ...graphResolveDepths,
      includePermissions: false,
    }),
    [entityTypeBaseUrl, graphResolveDepths, entityTypeId, ownedById],
  );

  const { data, loading, refetch } = useQuery<
    QueryEntitiesQuery,
    QueryEntitiesQueryVariables
  >(queryEntitiesQuery, {
    fetchPolicy: "cache-and-network",
    variables,
  });

  const hadCachedContent = useMemo(
    () => !!apolloClient.readQuery({ query: queryEntitiesQuery, variables }),
    [variables],
  );

  const subgraph = data?.queryEntities.subgraph
    ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
        data.queryEntities.subgraph,
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
