import { useQuery } from "@apollo/client";
import type { EntityRootType } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type { BaseUrl, VersionedUrl, WebId } from "@blockprotocol/type-system";
import type {
  EntityQueryCursor,
  EntityQuerySortingRecord,
  GraphResolveDepths,
} from "@local/hash-graph-client";
import type {
  ConversionRequest,
  GetEntitySubgraphRequest,
  HashEntity,
} from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  ignoreNoisySystemTypesFilter,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
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
  };
};

/**
 * These are the variables for the query which populates the "Entities" section of the sidebar,
 * if the user has chosen to show it as a toggleable list of types rather than a single 'Entities' link.
 */
export const generateSidebarEntityTypeEntitiesQueryVariables = ({
  webId,
}: {
  webId: WebId;
}): GetEntitySubgraphQueryVariables => {
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
      graphResolveDepths: zeroedGraphResolveDepths,
      includeDrafts: false,
      temporalAxes: currentTimeInstantTemporalAxes,
    },
    includePermissions: false,
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
}: UseEntityTypeEntitiesQueryParams): GetEntitySubgraphQueryVariables => {
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
      includeDrafts: false,
      includeEntityTypes: "resolvedWithDataTypeChildren",
      sortingPaths: sort ? [sort] : undefined,
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
        ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType<HashEntity>>(
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
