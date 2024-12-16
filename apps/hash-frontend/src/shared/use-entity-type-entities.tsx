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
/**
 * @todo H-3828 stop relying on this for account sidebar, then can move it into entities-visualizer
 */
import type { EntitiesVisualizerData } from "../pages/shared/entities-visualizer/use-entities-visualizer-data";

type UseEntityTypeEntitiesQueryParams = {
  cursor?: EntityQueryCursor | null;
  entityTypeBaseUrl?: BaseUrl;
  entityTypeId?: VersionedUrl;
  graphResolveDepths?: Partial<GraphResolveDepths>;
  includeArchived?: boolean;
  ownedByIds?: OwnedById[];
  limit?: number;
  sort?: GetEntitySubgraphRequest["sortingPaths"];
};

export const generateUseEntityTypeEntitiesQueryVariables = ({
  ownedByIds,
  entityTypeBaseUrl,
  entityTypeId,
  graphResolveDepths,
  ...rest
}: UseEntityTypeEntitiesQueryParams): GetEntitySubgraphQueryVariables => {
  return {
    request: {
      ...rest,
      includeCreatedByIds: true,
      includeCount: true,
      includeEditionCreatedByIds: true,
      includeTypeIds: true,
      includeWebIds: true,
      filter: {
        all: [
          ...(ownedByIds?.length
            ? [
                {
                  any: ownedByIds.map((ownedById) => ({
                    equal: [{ path: ["ownedById"] }, { parameter: ownedById }],
                  })),
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
      /**
       * @todo H-2633 when we use entity archival via timestamp, this will need varying to include archived entities
       */
      temporalAxes: currentTimeInstantTemporalAxes,
    },
    includePermissions: false,
  };
};

export const useEntityTypeEntities = (
  params: UseEntityTypeEntitiesQueryParams,
): EntitiesVisualizerData => {
  const { entityTypeBaseUrl, entityTypeId } = params;

  const variables = useMemo<GetEntitySubgraphQueryVariables>(
    () => generateUseEntityTypeEntitiesQueryVariables(params),
    [params],
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
    ...data?.getEntitySubgraph,
    entityTypeBaseUrl,
    entityTypeId,
    entities,
    hadCachedContent,
    loading,
    refetch,
    subgraph,
  };
};
