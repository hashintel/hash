import { useQuery } from "@apollo/client";

import { getRoots } from "@blockprotocol/graph/stdlib";
import { deserializeSubgraph } from "@local/hash-graph-sdk/subgraph";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { queryEntitySubgraphQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import { useAccumulatedCursorPagination } from "../../../../pages/shared/entity/entity-editor/links-section/use-accumulated-cursor-pagination";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type { EntityId } from "@blockprotocol/type-system";
import type {
  EntityQueryCursor,
  EntityQuerySortingRecord,
  Filter,
} from "@local/hash-graph-client";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

/** Entities fetched per page for the search bar's result list. */
export const searchBarEntitiesPageSize = 100;

type SearchSubgraph = Subgraph<EntityRootType<HashEntity>>;

/**
 * Cursor pagination needs a deterministic total order. The `uuid` is unique, so
 * it gives the cursor a stable boundary even when the semantic-distance filter
 * matches many entities; without it pages could overlap or skip results.
 */
const uuidSortingPath: EntityQuerySortingRecord = {
  path: ["uuid"],
  ordering: "ascending",
  nulls: "last",
};

type EntitySearchPage = {
  /**
   * Key for the cursor that produced this page, so a page is replaced (not
   * duplicated) if its query completes twice (e.g. cache hit then network).
   */
  cursorKey: string;
  entities: HashEntity[];
  nextCursor: EntityQueryCursor | null;
  subgraph: SearchSubgraph;
};

/** The running, incrementally-built accumulation of every page loaded so far. */
type Accumulated = {
  entities: HashEntity[];
  /** Dedup set keyed on `recordId.entityId`, so appends stay O(page size). */
  seenEntityIds: Set<EntityId>;
  subgraph: SearchSubgraph;
  nextCursor: EntityQueryCursor | null;
  /**
   * `true` once a page returns fewer rows than the page size, so a non-null
   * cursor past the last match can't keep `hasMore` true and trigger an empty
   * fetch.
   */
  exhausted: boolean;
};

/**
 * Shallow-merge two `{ [baseId]: { [revisionId]: value } }` records (a
 * subgraph's `vertices`/`edges` shape), adding later pages' revisions without
 * dropping earlier ones.
 */
const mergeRecordOfRecords = <T>(
  a: Record<string, Record<string, T>>,
  b: Record<string, Record<string, T>>,
): Record<string, Record<string, T>> => {
  const result: Record<string, Record<string, T>> = { ...a };
  for (const [baseId, revisions] of Object.entries(b)) {
    result[baseId] = { ...(result[baseId] ?? {}), ...revisions };
  }
  return result;
};

/**
 * Merge a later page's subgraph into the accumulated one, so entity-type and
 * source/target vertices resolved on any page stay available for labelling.
 */
const mergeSubgraphInto = (
  merged: SearchSubgraph,
  page: EntitySearchPage,
): SearchSubgraph => {
  const vertices = mergeRecordOfRecords(
    merged.vertices as Record<string, Record<string, unknown>>,
    page.subgraph.vertices as Record<string, Record<string, unknown>>,
  ) as SearchSubgraph["vertices"];

  const edges = mergeRecordOfRecords(
    merged.edges as Record<string, Record<string, unknown>>,
    page.subgraph.edges as Record<string, Record<string, unknown>>,
  ) as SearchSubgraph["edges"];

  return { ...merged, vertices, edges };
};

const appendPage = (
  accumulated: Accumulated,
  page: EntitySearchPage,
): Accumulated => {
  for (const entity of page.entities) {
    const entityId = entity.metadata.recordId.entityId;
    if (!accumulated.seenEntityIds.has(entityId)) {
      accumulated.seenEntityIds.add(entityId);
      accumulated.entities.push(entity);
    }
  }

  // Exhausted once a page returns fewer rows than the page size (incl. zero),
  // even if the API still handed back a non-null cursor.
  const exhausted = page.entities.length < searchBarEntitiesPageSize;

  return {
    ...accumulated,
    subgraph: mergeSubgraphInto(accumulated.subgraph, page),
    exhausted,
    nextCursor: exhausted ? null : page.nextCursor,
  };
};

/** The empty accumulation, seeded with the first page's subgraph to merge into. */
const seedAccumulated = (firstPage: EntitySearchPage): Accumulated => ({
  entities: [],
  seenEntityIds: new Set<EntityId>(),
  subgraph: firstPage.subgraph,
  nextCursor: null,
  exhausted: false,
});

const finalizeAccumulated = (accumulated: Accumulated): Accumulated => ({
  ...accumulated,
  entities: [...accumulated.entities],
});

/**
 * Fetches entities matching the search bar's semantic-distance filter a page at
 * a time, accumulating the loaded pages for the result list's infinite scroll.
 */
export const useSearchBarEntities = ({
  filter,
  resetKey,
  skip,
}: {
  filter: Filter;
  /** Discards accumulated pages when it changes, e.g. on a new search term. */
  resetKey: string;
  skip: boolean;
}): {
  entities: HashEntity[];
  subgraph?: SearchSubgraph;
  /** Whether the first page is still loading. */
  initialLoading: boolean;
  /** Whether a subsequent page is being fetched. */
  loadingMore: boolean;
  /** Fetch the next page (no-op if there are no more pages). */
  loadMore: () => void;
  /** Whether there are more pages to fetch. */
  hasMore: boolean;
} => {
  const {
    cursor,
    cursorKey,
    pageCount,
    addPage,
    accumulated,
    loadMore,
    hasMore,
  } = useAccumulatedCursorPagination<
    EntityQueryCursor,
    EntitySearchPage,
    Accumulated
  >({
    resetKey,
    seed: seedAccumulated,
    appendPage,
    finalize: finalizeAccumulated,
  });

  const { loading } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    fetchPolicy: "cache-and-network",
    skip,
    variables: {
      request: {
        filter,
        temporalAxes: currentTimeInstantTemporalAxes,
        graphResolveDepths: {
          inheritsFrom: 255,
          isOfType: true,
        },
        traversalPaths: [],
        includeDrafts: false,
        includePermissions: false,
        cursor,
        limit: searchBarEntitiesPageSize,
        sortingPaths: [uuidSortingPath],
      },
    },
    onCompleted: (data) => {
      const subgraph = deserializeSubgraph<EntityRootType<HashEntity>>(
        data.queryEntitySubgraph.subgraph,
      );

      addPage({
        cursorKey,
        entities: getRoots(subgraph),
        nextCursor: data.queryEntitySubgraph.cursor ?? null,
        subgraph,
      });
    },
  });

  return {
    entities: accumulated?.entities ?? [],
    subgraph: accumulated?.subgraph,
    initialLoading: loading && pageCount === 0,
    loadingMore: loading && cursor !== undefined,
    loadMore,
    hasMore,
  };
};
