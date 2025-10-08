import { useQuery } from "@apollo/client";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type { BaseUrl, VersionedUrl, WebId } from "@blockprotocol/type-system";
import type {
  EntityQueryCursor,
  EntityQuerySortingRecord,
  Filter,
  GraphResolveDepths,
} from "@local/hash-graph-client";
import {
  type ConversionRequest,
  deserializeQueryEntitySubgraphResponse,
} from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  ignoreNoisySystemTypesFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { useMemo } from "react";

import type {
  QueryEntitiesQueryVariables,
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../graphql/api-types.gen";
import { queryEntitySubgraphQuery } from "../graphql/queries/knowledge/entity.queries";
import { apolloClient } from "../lib/apollo-client";
/**
 * @todo H-3828 stop relying on this for account sidebar, then can move it into entities-visualizer
 */
import type { EntitiesVisualizerData } from "../pages/shared/entities-visualizer/use-entities-visualizer-data";

type UseEntityTypeEntitiesQueryParams = {
  conversions?: ConversionRequest[];
  cursor?: EntityQueryCursor | null;
  entityTypeBaseUrl?: BaseUrl;
  entityTypeIds?: VersionedUrl[];
  graphResolveDepths?: Partial<GraphResolveDepths>;
  includeArchived?: boolean;
  includeTypeIds?: boolean;
  webIds?: WebId[];
  limit?: number;
  sort?: EntityQuerySortingRecord;
};

export const generateUseEntityTypeEntitiesFilter = ({
  excludeWebIds,
  webIds,
  entityTypeBaseUrl,
  entityTypeIds,
  includeArchived,
}: Pick<
  UseEntityTypeEntitiesQueryParams,
  "entityTypeBaseUrl" | "entityTypeIds" | "includeArchived" | "webIds"
> & {
  excludeWebIds?: WebId[];
}): Filter => ({
  all: [
    ...(!includeArchived
      ? [
          {
            notEqual: [{ path: ["archived"] }, { parameter: true }],
          },
          {
            any: [
              {
                exists: {
                  path: [
                    "properties",
                    systemPropertyTypes.archived.propertyTypeBaseUrl,
                  ],
                },
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
    ...(webIds?.length
      ? [
          {
            any: webIds.map((webId) => ({
              equal: [{ path: ["webId"] }, { parameter: webId }],
            })),
          },
        ]
      : []),
    ...(excludeWebIds?.length
      ? [
          {
            all: excludeWebIds.map((webId) => ({
              notEqual: [{ path: ["webId"] }, { parameter: webId }],
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
});

/**
 * These are the variables for the query which populates the "Entities" section of the sidebar,
 * if the user has chosen to show it as a toggleable list of types rather than a single 'Entities' link.
 */
export const generateSidebarEntityTypeEntitiesQueryVariables = ({
  webId,
}: {
  webId: WebId;
}): QueryEntitiesQueryVariables => {
  return {
    request: {
      /**
       * We only make this request to get the count of entities by typeId to filter types in the sidebar,
       * to only those for which the active workspace has at least one entity.
       *
       * We don't actually need a single entity but the Graph rejects requests with a limit of 0.
       * We currently can't use countEntities as it just returns a total number, with no count by typeId.
       */
      limit: 1,
      includeTypeIds: true,
      filter: generateUseEntityTypeEntitiesFilter({
        webIds: [webId],
        includeArchived: false,
      }),
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includePermissions: false,
    },
  };
};

const generateUseEntityTypeEntitiesQueryVariables = ({
  webIds,
  entityTypeBaseUrl,
  entityTypeIds,
  graphResolveDepths,
  includeArchived,
  sort,
  ...rest
}: UseEntityTypeEntitiesQueryParams): QueryEntitySubgraphQueryVariables => {
  return {
    request: {
      ...rest,
      includeCreatedByIds: true,
      includeCount: true,
      includeEditionCreatedByIds: true,
      includeTypeIds: true,
      includeTypeTitles: true,
      includeWebIds: true,
      filter: generateUseEntityTypeEntitiesFilter({
        includeArchived,
        webIds,
        entityTypeBaseUrl,
        entityTypeIds,
      }),
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        ...graphResolveDepths,
      },
      sortingPaths: sort ? [sort] : undefined,
      /**
       * @todo H-2633 when we use entity archival via timestamp, this will need varying to include archived entities
       */
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includeEntityTypes: "resolvedWithDataTypeChildren",
      includePermissions: false,
    },
  } satisfies QueryEntitySubgraphQueryVariables;
};

export const useEntityTypeEntities = (
  params: UseEntityTypeEntitiesQueryParams,
  onCompleted?: (data: QueryEntitySubgraphQuery) => void,
): Omit<EntitiesVisualizerData, "tableData" | "updateTableData"> => {
  const variables = useMemo<QueryEntitySubgraphQueryVariables>(
    () => generateUseEntityTypeEntitiesQueryVariables(params),
    [params],
  );

  const { data, loading, refetch } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    fetchPolicy: "cache-and-network",
    onCompleted,
    variables,
  });

  const hadCachedContent = useMemo(
    () =>
      !!apolloClient.readQuery({ query: queryEntitySubgraphQuery, variables }),
    [variables],
  );

  const subgraph = useMemo(
    () =>
      data?.queryEntitySubgraph
        ? deserializeQueryEntitySubgraphResponse(data.queryEntitySubgraph)
            .subgraph
        : undefined,
    [data?.queryEntitySubgraph],
  );

  const entities = useMemo(
    () => (subgraph ? getRoots(subgraph) : undefined),
    [subgraph],
  );

  return {
    ...data?.queryEntitySubgraph,
    entities,
    hadCachedContent,
    loading,
    refetch,
    subgraph,
  };
};
