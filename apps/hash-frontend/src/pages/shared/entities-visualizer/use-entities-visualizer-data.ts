import { useQuery } from "@apollo/client";
import { useCallback, useMemo, useState } from "react";

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
import { useMemoCompare } from "../../../shared/use-memo-compare";
import { buildEntitiesFilter } from "./shared/build-filter";
import { generateTableDataFromRows } from "./shared/generate-table-data-from-rows";
import { traversalPathsForView } from "./shared/traversal-paths";
import {
  mergeClosedMultiEntityTypesRootMaps,
  mergeDefinitions,
} from "./use-entities-visualizer-data/merge-page-data";
import { mergeTableData } from "./use-entities-visualizer-data/merge-table-data";
import {
  advancePageChain,
  type ChainPage,
  type PageChain,
} from "./use-entities-visualizer-data/page-chain";

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
} from "./entities-table-data";
import type { EntitiesFilterState } from "./shared/filter-state";
import type { ApolloError } from "@apollo/client";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type {
  BaseUrl,
  EntityId,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import type {
  EntityQueryCursor,
  EntityQuerySortingRecord,
  Filter,
  TraversalPath,
} from "@local/hash-graph-client";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";

type SubgraphResponse = QueryEntitySubgraphQuery["queryEntitySubgraph"];

/**
 * One captured page of results. The response is deserialized exactly once,
 * when the page is captured into the chain.
 */
interface ResultPage extends ChainPage<SubgraphResponse> {
  readonly definitions: ClosedMultiEntityTypesDefinitions;
  /** Cursor for the page after this one; `null` when this is the last page. */
  readonly nextCursor: EntityQueryCursor | null;
  readonly rootEntities: HashEntity[];
  readonly rootMap: ClosedMultiEntityTypesRootMap;
  readonly subgraph: Subgraph<EntityRootType<HashEntity>, HashEntity>;
}

/**
 * The inputs (excluding pagination) that define one query. Compared by object
 * identity: a new identity means the accumulated pages describe a different
 * result set and are discarded once the first page for the new inputs
 * arrives.
 */
interface QueryInputsIdentity {
  readonly conversions: ConversionRequest[] | undefined;
  readonly filter: Filter;
  readonly limit: number;
  readonly sort: EntityQuerySortingRecord | undefined;
  readonly traversalPaths: TraversalPath[];
}

export type EntitiesVisualizerData = {
  /**
   * Whether a request for newer results is in flight. While `true` and the
   * status is "ready", the ready fields are the previous request's results,
   * kept available so consumers can keep showing them (with a loading
   * indicator) instead of flashing an empty state.
   */
  fetching: boolean;
  /** From the independent summary query; available regardless of status. */
  totalResultCount: number | null;
} & (
  | { status: "loading" }
  | { status: "error"; error: ApolloError; retry: () => void }
  | {
      status: "ready";
      closedMultiEntityTypesRootMap: ClosedMultiEntityTypesRootMap;
      definitions: ClosedMultiEntityTypesDefinitions;
      /**
       * All accumulated pages' results. For Graph-view queries this is every
       * fetched vertex -- the query roots plus the frontier link-endpoints
       * the traversal pulled in; otherwise it is the roots only.
       */
      entities: HashEntity[];
      /** EntityIds of the query roots. `entities` not in this set are frontier nodes. */
      rootEntityIds: EntityId[];
      tableData: EntitiesTableData;
      /**
       * Fetches the next page, appending it to the accumulated results.
       * Undefined when there is no next page.
       */
      fetchNextPage: (() => void) | undefined;
      hasNextPage: boolean;
      /**
       * Discards the accumulated pages and refetches from page one, e.g.
       * after a bulk action changed the underlying entities.
       */
      refresh: () => void;
    }
);

interface UseEntitiesVisualizerData {
  readonly conversions?: ConversionRequest[];
  readonly entityTypeBaseUrl?: BaseUrl;
  readonly entityTypeIds?: VersionedUrl[];
  readonly filterState: EntitiesFilterState;
  readonly hideColumns?: (keyof EntitiesTableRow)[];
  readonly internalWebs: { webId: WebId }[];
  readonly limit: number;
  readonly sort?: EntityQuerySortingRecord;
  readonly view: VisualizerView;
}

/**
 * Fetches the entities matching the given query inputs, accumulating "Show
 * more" pages so that every view (table, grid, graph) renders the same,
 * complete window of results.
 *
 * Pagination is owned here rather than by the caller because a cursor is
 * only meaningful relative to responses: pages are stored together with the
 * identity of the inputs they were fetched for ({@link QueryInputsIdentity}),
 * so any input change automatically restarts from page one -- there is no
 * pagination state for callers to remember to reset. The previous inputs'
 * pages remain on screen (with `fetching: true`) until the first page of the
 * new query arrives.
 */
export const useEntitiesVisualizerData = ({
  conversions,
  entityTypeBaseUrl,
  entityTypeIds,
  filterState,
  hideColumns,
  internalWebs,
  limit,
  sort,
  view,
}: UseEntitiesVisualizerData): EntitiesVisualizerData => {
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
      }),
    [filterState, internalWebIds, entityTypeBaseUrl, entityTypeIds],
  );

  /**
   * A module constant per view "shape": Table and Grid share the same paths
   * (and therefore the same query identity), so switching between them keeps
   * the accumulated pages.
   */
  const traversalPaths = traversalPathsForView(view);

  /**
   * The page chain's convergence relies on this object keeping its identity
   * for unchanged inputs: every field is a memo, a module constant, or a
   * primitive. An unstable field here would discard the chain every render.
   */
  const queryInputs = useMemo<QueryInputsIdentity>(
    () => ({
      conversions,
      filter,
      limit,
      sort,
      traversalPaths,
    }),
    [conversions, filter, limit, sort, traversalPaths],
  );

  const [chain, setChain] = useState<PageChain<
    QueryInputsIdentity,
    ResultPage
  > | null>(null);

  /**
   * The cursor to apply to the query: only a chain issued for the current
   * inputs may continue paginating; otherwise we are (re)fetching page one.
   */
  const requestedCursor =
    chain !== null && chain.issuedFor === queryInputs
      ? chain.activeCursor
      : undefined;

  const variables = useMemo<QueryEntitySubgraphQueryVariables>(
    () => ({
      request: {
        conversions: queryInputs.conversions,
        cursor: requestedCursor,
        limit: queryInputs.limit,
        filter: queryInputs.filter,
        traversalPaths: queryInputs.traversalPaths,
        sortingPaths: queryInputs.sort ? [queryInputs.sort] : undefined,
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
    [queryInputs, requestedCursor],
  );

  const { data, error, loading, refetch } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    fetchPolicy: "cache-and-network",
    variables,
  });

  const buildPage = useCallback(
    (
      pageResponse: SubgraphResponse,
      forCursor: EntityQueryCursor | undefined,
    ): ResultPage => {
      const { subgraph } = deserializeQueryEntitySubgraphResponse(pageResponse);

      const pageDefinitions = pageResponse.definitions;

      if (!pageDefinitions) {
        // The query always sets `includeEntityTypes`, so this cannot happen.
        throw new Error("Expected definitions in queryEntitySubgraph response");
      }

      return {
        sourceResponse: pageResponse,
        forCursor,
        definitions: pageDefinitions,
        nextCursor: pageResponse.cursor ?? null,
        rootEntities: getRoots(subgraph),
        rootMap: pageResponse.closedMultiEntityTypes ?? {},
        subgraph,
      };
    },
    [],
  );

  /**
   * Capture the latest response into the chain during render (the React
   * "adjust state while rendering" pattern). `data` always corresponds to the
   * current variables -- Apollo clears it while a request for new variables
   * is in flight -- so a defined response can be attributed to
   * (`queryInputs`, `requestedCursor`) without bookkeeping in a completion
   * callback. Everything below derives from `displayedChain`, which keeps
   * showing the previous inputs' pages until the new first page lands.
   */
  const displayedChain = advancePageChain({
    buildPage,
    chain,
    identity: queryInputs,
    requestedCursor,
    response: data?.queryEntitySubgraph,
  });

  if (displayedChain !== chain) {
    setChain(displayedChain);
  }

  const pages = displayedChain?.pages ?? null;

  const chainIsForGraphView =
    displayedChain !== null &&
    displayedChain.issuedFor.traversalPaths === traversalPathsForView("Graph");

  const entities = useMemo(() => {
    if (!pages) {
      return null;
    }

    if (chainIsForGraphView) {
      // Frontier vertices can recur across pages; dedupe on id, later pages winning.
      const entityById = new Map<EntityId, HashEntity>();

      for (const page of pages) {
        for (const vertex of getLatestEntityVertices(page.subgraph)) {
          entityById.set(vertex.inner.metadata.recordId.entityId, vertex.inner);
        }
      }

      return [...entityById.values()];
    }

    // Roots are disjoint across pages (cursor pagination), so concatenation suffices.
    return pages.flatMap((page) => page.rootEntities);
  }, [pages, chainIsForGraphView]);

  const rootEntityIds = useMemo(() => {
    if (!pages) {
      return null;
    }

    return pages.flatMap((page) =>
      page.rootEntities.map((entity) => entity.metadata.recordId.entityId),
    );
  }, [pages]);

  const closedMultiEntityTypesRootMap = useMemo(
    () =>
      pages
        ? mergeClosedMultiEntityTypesRootMaps(pages.map((page) => page.rootMap))
        : null,
    [pages],
  );

  const definitions = useMemo(
    () =>
      pages ? mergeDefinitions(pages.map((page) => page.definitions)) : null,
    [pages],
  );

  /**
   * `hideColumns` is intentionally not part of the query identity (callers
   * may pass inline arrays); stabilize it here so the table-data memo doesn't
   * regenerate for an identical value.
   */
  const stableHideColumns = useMemoCompare(
    () => hideColumns,
    [hideColumns],
    (oldValue, newValue) =>
      oldValue === newValue ||
      (oldValue !== undefined &&
        newValue !== undefined &&
        oldValue.length === newValue.length &&
        oldValue.every((column, index) => column === newValue[index])),
  );

  const hideArchivedColumn = !filterState.includeArchived;

  /**
   * Derived from the pages rather than imperatively appended to, so the table
   * can never drift from what was fetched. Graph-view pages produce table
   * data too -- their roots are exactly the rows a Table query would return
   * -- so switching Graph -> Table shows rows instantly while the
   * table-shaped query loads.
   */
  const tableData = useMemo(() => {
    if (!pages) {
      return null;
    }

    return pages
      .map((page) =>
        generateTableDataFromRows({
          closedMultiEntityTypesRootMap: page.rootMap,
          definitions: page.definitions,
          entities: page.rootEntities.map((entity) => entity.toJSON()),
          subgraph: page.sourceResponse.subgraph,
          hideColumns: stableHideColumns,
          hideArchivedColumn,
        }),
      )
      .reduce(mergeTableData);
  }, [pages, stableHideColumns, hideArchivedColumn]);

  const nextCursor = pages?.at(-1)?.nextCursor ?? null;

  const fetchNextPage = useMemo(() => {
    if (nextCursor === null) {
      return undefined;
    }

    return () => {
      setChain((previousChain) => {
        // Guard against a click racing an input change: only the chain the
        // button belonged to may paginate.
        if (!previousChain || previousChain.issuedFor !== queryInputs) {
          return previousChain;
        }

        const cursor = previousChain.pages.at(-1)?.nextCursor;

        return cursor
          ? { ...previousChain, activeCursor: cursor }
          : previousChain;
      });
    };
  }, [nextCursor, queryInputs]);

  const refresh = useCallback(() => {
    if (requestedCursor === undefined) {
      // Already on page one: the variables won't change, so force the
      // network round-trip explicitly.
      void refetch();
    } else {
      // Clearing the cursor changes the query variables; cache-and-network
      // then hits the network, and the arriving first page rebuilds the
      // chain (dropping the accumulated pages).
      setChain((previousChain) =>
        previousChain
          ? { ...previousChain, activeCursor: undefined }
          : previousChain,
      );
    }
  }, [refetch, requestedCursor]);

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const { data: summaryData, previousData: previousSummaryData } = useQuery<
    SummarizeEntitiesQuery,
    SummarizeEntitiesQueryVariables
  >(summarizeEntitiesQuery, {
    variables: {
      request: {
        filter,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includeCount: true,
      },
    },
  });

  const totalResultCount =
    (summaryData ?? previousSummaryData)?.summarizeEntities.count ?? null;

  if (error) {
    return {
      status: "error",
      error,
      retry,
      fetching: loading,
      totalResultCount,
    };
  }

  if (
    displayedChain === null ||
    entities === null ||
    rootEntityIds === null ||
    tableData === null ||
    closedMultiEntityTypesRootMap === null ||
    definitions === null
  ) {
    return { status: "loading", fetching: loading, totalResultCount };
  }

  return {
    status: "ready",
    fetching: loading,
    totalResultCount,
    closedMultiEntityTypesRootMap,
    definitions,
    entities,
    rootEntityIds,
    tableData,
    fetchNextPage,
    hasNextPage: nextCursor !== null,
    refresh,
  };
};
