import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import { getRoots } from "@blockprotocol/graph/stdlib";
import {
  type ConversionRequest,
  deserializeQueryEntitySubgraphResponse,
  type HashEntity,
} from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { queryEntitySubgraphQuery } from "../../../graphql/queries/knowledge/entity.queries";
import { apolloClient } from "../../../lib/apollo-client";
import { buildEntitiesFilter } from "./data/build-filter";
import { traversalPathsForView } from "./data/traversal-paths";
import { hasActiveSemanticQuery } from "./data/types";
import { useEntitiesTableData } from "./use-entities-table-data";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../graphql/api-types.gen";
import type { VisualizerView } from "../visualizer-views";
import type { EntitiesFilterState } from "./data/types";
import type {
  EntitiesTableData,
  EntitiesTableRow,
  UpdateTableDataFn,
} from "./types";
import type { ApolloQueryResult } from "@apollo/client";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type { BaseUrl, VersionedUrl, WebId } from "@blockprotocol/type-system";
import type {
  EntityQueryCursor,
  EntityQuerySortingRecord,
} from "@local/hash-graph-client";

export type EntitiesVisualizerData = Partial<
  Pick<
    QueryEntitySubgraphQuery["queryEntitySubgraph"],
    | "closedMultiEntityTypes"
    | "count"
    | "definitions"
    | "cursor"
    | "typeIds"
    | "typeTitles"
    | "webIds"
  >
> & {
  entities?: HashEntity[];
  hadCachedContent: boolean;
  loading: boolean;
  refetch: () => Promise<ApolloQueryResult<QueryEntitySubgraphQuery>>;
  subgraph?: Subgraph<EntityRootType<HashEntity>>;
  tableData: EntitiesTableData | null;
  updateTableData: UpdateTableDataFn;
};

export const useEntitiesVisualizerData = (params: {
  conversions?: ConversionRequest[];
  cursor?: EntityQueryCursor;
  entityTypeBaseUrl?: BaseUrl;
  entityTypeIds?: VersionedUrl[];
  filterState: EntitiesFilterState;
  hideColumns?: (keyof EntitiesTableRow)[];
  internalWebIds: WebId[];
  limit?: number;
  sort?: EntityQuerySortingRecord;
  view: VisualizerView;
}): EntitiesVisualizerData => {
  const {
    conversions,
    cursor,
    entityTypeBaseUrl,
    entityTypeIds,
    filterState,
    hideColumns,
    internalWebIds,
    limit,
    sort,
    view,
  } = params;

  const { tableData, updateTableData } = useEntitiesTableData({
    hideColumns,
    hideArchivedColumn: !filterState.includeArchived,
  });

  /**
   * The graph layer disallows cursors alongside a `cosineDistance` filter
   * ("Cannot use distance function with cursor"). The caller already avoids
   * setting a cursor while searching (load-more is disabled and changing the
   * query resets the cursor), but force it off here too so the request can
   * never 500.
   */
  const cursorForRequest = hasActiveSemanticQuery(filterState)
    ? undefined
    : cursor;

  const variables = useMemo<QueryEntitySubgraphQueryVariables>(
    () => ({
      request: {
        conversions,
        cursor: cursorForRequest,
        limit,
        includeCount: true,
        includeTypeIds: true,
        includeTypeTitles: true,
        includeWebIds: true,
        filter: buildEntitiesFilter({
          filterState,
          internalWebIds,
          pinnedEntityTypeBaseUrl: entityTypeBaseUrl,
          pinnedEntityTypeIds: entityTypeIds,
        }),
        traversalPaths: traversalPathsForView(view),
        sortingPaths: sort ? [sort] : undefined,
        /**
         * @todo H-2633 when we use entity archival via timestamp, this will
         * need varying to include archived entities.
         */
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includeEntityTypes: "resolvedWithDataTypeChildren",
        includePermissions: false,
      },
    }),
    [
      conversions,
      cursorForRequest,
      entityTypeBaseUrl,
      entityTypeIds,
      filterState,
      internalWebIds,
      limit,
      sort,
      view,
    ],
  );

  const { data, loading, refetch } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    fetchPolicy: "cache-and-network",
    onCompleted: (completedData) => {
      if (view === "Graph") {
        return;
      }

      const newSubgraph = deserializeQueryEntitySubgraphResponse(
        completedData.queryEntitySubgraph,
      ).subgraph;

      const newEntities = getRoots(newSubgraph);

      updateTableData({
        appliedPaginationCursor: cursorForRequest ?? null,
        closedMultiEntityTypesRootMap:
          completedData.queryEntitySubgraph.closedMultiEntityTypes ?? {},
        definitions: completedData.queryEntitySubgraph.definitions,
        entities: newEntities,
        subgraph: newSubgraph,
      });
    },
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

  return useMemo(
    () => ({
      ...data?.queryEntitySubgraph,
      entities,
      hadCachedContent,
      loading,
      refetch,
      subgraph,
      tableData,
      updateTableData,
    }),
    [
      data?.queryEntitySubgraph,
      entities,
      hadCachedContent,
      loading,
      refetch,
      subgraph,
      tableData,
      updateTableData,
    ],
  );
};
