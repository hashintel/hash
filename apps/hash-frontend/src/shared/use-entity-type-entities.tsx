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
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
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
  entityTypeIds?: VersionedUrl[];
  graphResolveDepths?: Partial<GraphResolveDepths>;
  includeArchived?: boolean;
  ownedByIds?: OwnedById[];
  limit?: number;
  sort?: GetEntitySubgraphRequest["sortingPaths"];
};

export const generateUseEntityTypeEntitiesFilter = ({
  excludeOwnedByIds,
  ownedByIds,
  entityTypeBaseUrl,
  entityTypeIds,
  includeArchived,
}: Pick<
  UseEntityTypeEntitiesQueryParams,
  "entityTypeBaseUrl" | "entityTypeIds" | "includeArchived" | "ownedByIds"
> & {
  excludeOwnedByIds?: OwnedById[];
}): GetEntitySubgraphRequest["filter"] => {
  return {
    // @ts-expect-error -- We need to update the type definition of `EntityStructuralQuery` to allow for this
    //   @see https://linear.app/hash/issue/H-1207
    all: [
      ...(!includeArchived
        ? [
            {
              notEqual: [{ path: ["archived"] }, { parameter: true }],
            },
            {
              any: [
                {
                  equal: [
                    {
                      path: [
                        "properties",
                        systemPropertyTypes.archived.propertyTypeBaseUrl,
                      ],
                    },
                    null,
                  ],
                },
                {
                  equal: [
                    {
                      path: [
                        "properties",
                        systemPropertyTypes.archived.propertyTypeBaseUrl,
                      ],
                    },
                    { parameter: false },
                  ],
                },
              ],
            },
          ]
        : []),
      ...(ownedByIds?.length
        ? [
            {
              any: ownedByIds.map((ownedById) => ({
                equal: [{ path: ["ownedById"] }, { parameter: ownedById }],
              })),
            },
          ]
        : []),
      ...(excludeOwnedByIds?.length
        ? [
            {
              all: excludeOwnedByIds.map((ownedById) => ({
                notEqual: [{ path: ["ownedById"] }, { parameter: ownedById }],
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
        : entityTypeIds?.length
          ? [
              {
                any: entityTypeIds.map((entityTypeId) => ({
                  equal: [
                    { path: ["type", "versionedUrl"] },
                    { parameter: entityTypeId },
                  ],
                })),
              },
            ]
          : []),
      ...(!entityTypeIds && !entityTypeBaseUrl
        ? [ignoreNoisySystemTypesFilter]
        : []),
    ],
  };
};

export const generateUseEntityTypeEntitiesQueryVariables = ({
  ownedByIds,
  entityTypeBaseUrl,
  entityTypeIds,
  graphResolveDepths,
  includeArchived,
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
      filter: generateUseEntityTypeEntitiesFilter({
        includeArchived,
        ownedByIds,
        entityTypeBaseUrl,
        entityTypeIds,
      }),
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
  } satisfies GetEntitySubgraphQueryVariables;
};

export const useEntityTypeEntities = (
  params: UseEntityTypeEntitiesQueryParams,
): EntitiesVisualizerData => {
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
    entities,
    hadCachedContent,
    loading,
    refetch,
    subgraph,
  };
};
