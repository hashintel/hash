import { useQuery } from "@apollo/client";
import { useCallback, useMemo } from "react";

import { getLatestEntityVertices, getRoots } from "@blockprotocol/graph/stdlib";
import {
  type ConversionRequest,
  deserializeQueryEntitySubgraphResponse,
  type HashEntity,
} from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import {
  queryEntitySubgraphQuery,
  summarizeEntitiesQuery,
} from "../../../graphql/queries/knowledge/entity.queries";
import { apolloClient } from "../../../lib/apollo-client";
import { buildEntitiesFilter } from "./shared/build-filter";
import { traversalPathsForView } from "./shared/traversal-paths";
import { useEntitiesTableData } from "./use-entities-table-data";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
  SummarizeEntitiesQuery,
  SummarizeEntitiesQueryVariables,
} from "../../../graphql/api-types.gen";
import type { VisualizerView } from "../visualizer-views";
import type {
  EntitiesTableData,
  EntitiesTableRow,
  UpdateTableDataFn,
} from "./entities-table-data";
import type { EntitiesFilterState } from "./shared/filter-state";
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
    "closedMultiEntityTypes" | "definitions" | "cursor"
  >
> & {
  entities?: HashEntity[];
  hadCachedContent: boolean;
  loading: boolean;
  /**
   * Whether or not a network request is in process.
   * Note that if is hasCachedContent is true, data for the given query is available before loading is complete.
   * The cached content will be replaced automatically and the value updated when the network request completes.
   */
  /**
   * Refetches the subgraph query only — the type universe keeps its last
   * snapshot, so entities of types that appeared after it loaded stay hidden
   * until the universe query itself refetches. Resolves to `undefined` without
   * querying while the type universe is still awaited.
   */
  refetch: () => Promise<
    ApolloQueryResult<QueryEntitySubgraphQuery> | undefined
  >;
  subgraph?: Subgraph<EntityRootType<HashEntity>>;
  tableData: EntitiesTableData | null;
  totalResultCount: number | null;
  updateTableData: UpdateTableDataFn;
};

export const useEntitiesVisualizerData = (params: {
  conversions?: ConversionRequest[];
  cursor?: EntityQueryCursor;
  entityTypeBaseUrl?: BaseUrl;
  entityTypeIds?: VersionedUrl[];
  filterState: EntitiesFilterState;
  hideColumns?: (keyof EntitiesTableRow)[];
  internalWebs: { webId: WebId }[];
  limit?: number;
  sort?: EntityQuerySortingRecord;
  /**
   * The type universe from `useAvailableTypes` — `null` while the summary is in
   * flight, and permanently for pinned types, which never fetch it. The default
   * (no type selection) view sends it as an include-type clause and holds its
   * queries back until it arrives — see {@link buildEntitiesFilter}.
   */
  typeUniverse: VersionedUrl[] | null;
  /**
   * Set when the type universe failed to load. The gated queries stay skipped,
   * but `loading` stops reporting `true` so the page can show an error state
   * instead of an endless spinner.
   */
  typeUniverseError?: Error;
  view: VisualizerView;
}): EntitiesVisualizerData => {
  const {
    conversions,
    cursor,
    entityTypeBaseUrl,
    entityTypeIds,
    filterState,
    hideColumns,
    internalWebs,
    limit,
    sort,
    typeUniverse,
    typeUniverseError,
    view,
  } = params;

  const { tableData, updateTableData } = useEntitiesTableData({
    hideColumns,
    hideArchivedColumn: !filterState.includeArchived,
  });

  const internalWebIds = useMemo(
    () => internalWebs.map(({ webId }) => webId),
    [internalWebs],
  );

  const filter = useMemo(
    () =>
      buildEntitiesFilter({
        filterState,
        internalWebIds,
        pinnedEntityTypeBaseUrl: entityTypeBaseUrl,
        pinnedEntityTypeIds: entityTypeIds,
        typeUniverse,
      }),
    [
      filterState,
      internalWebIds,
      entityTypeBaseUrl,
      entityTypeIds,
      typeUniverse,
    ],
  );

  // TODO(BE-705): a dedicated Graph endpoint will run the summary and the page
  //  query in one transaction, replacing this client-side coordination.
  const awaitingTypeUniverse =
    typeUniverse === null &&
    !entityTypeBaseUrl &&
    !entityTypeIds?.length &&
    filterState.type.selectedTypeIds === null;

  const variables = useMemo<QueryEntitySubgraphQueryVariables>(
    () => ({
      request: {
        conversions,
        cursor,
        limit,
        filter,
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
    [conversions, cursor, filter, limit, sort, view],
  );

  const { data: summaryData } = useQuery<
    SummarizeEntitiesQuery,
    SummarizeEntitiesQueryVariables
  >(summarizeEntitiesQuery, {
    skip: awaitingTypeUniverse,
    variables: {
      request: {
        filter,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includeCount: true,
      },
    },
  });

  const { data, loading, refetch } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    fetchPolicy: "cache-and-network",
    skip: awaitingTypeUniverse,
    onCompleted: (completedData) => {
      if (view === "Graph") {
        return;
      }

      const newSubgraph = deserializeQueryEntitySubgraphResponse(
        completedData.queryEntitySubgraph,
      ).subgraph;

      const newEntities = getRoots(newSubgraph);

      updateTableData({
        appendRows: !!cursor,
        closedMultiEntityTypesRootMap:
          completedData.queryEntitySubgraph.closedMultiEntityTypes ?? {},
        definitions: completedData.queryEntitySubgraph.definitions,
        entities: newEntities,
        subgraph: newSubgraph,
      });
    },
    variables,
  });

  // Apollo's refetch punches through `skip`, and while the gate holds the built
  // filter has no type clause at all — exactly the unestimable shape the gate
  // exists to prevent. Drop the call instead.
  const guardedRefetch = useCallback(async () => {
    if (awaitingTypeUniverse) {
      return undefined;
    }

    return refetch();
  }, [awaitingTypeUniverse, refetch]);

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
    () =>
      subgraph
        ? view === "Graph"
          ? getLatestEntityVertices(subgraph).map((vertex) => vertex.inner)
          : getRoots(subgraph)
        : undefined,
    [subgraph, view],
  );

  return useMemo(
    () => ({
      ...data?.queryEntitySubgraph,
      entities,
      hadCachedContent,
      loading: loading || (awaitingTypeUniverse && !typeUniverseError),
      refetch: guardedRefetch,
      subgraph,
      tableData,
      totalResultCount: summaryData?.summarizeEntities.count ?? null,
      updateTableData,
    }),
    [
      data?.queryEntitySubgraph,
      summaryData?.summarizeEntities,
      entities,
      hadCachedContent,
      loading,
      awaitingTypeUniverse,
      typeUniverseError,
      guardedRefetch,
      subgraph,
      tableData,
      updateTableData,
    ],
  );
};
