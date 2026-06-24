import { useQuery } from "@apollo/client";
import { useCallback } from "react";

import { getRoots } from "@blockprotocol/graph/stdlib";
import { deserializeSubgraph } from "@local/hash-graph-sdk/subgraph";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { queryEntitySubgraphQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import { queryEntityTypesQuery } from "../../../../graphql/queries/ontology/entity-type.queries";
import { useAccumulatedCursorPagination } from "../../../../pages/shared/entity/entity-editor/links-section/use-accumulated-cursor-pagination";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
} from "../../../../graphql/api-types.gen";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type {
  EntityId,
  EntityType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type {
  EntityQueryCursor,
  EntityQuerySortingRecord,
  Filter,
} from "@local/hash-graph-client";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

/** Entities and entity types fetched per page for the search bar's result list. */
export const searchBarPageSize = 10;

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

// --- Entities --------------------------------------------------------------

type EntitySearchPage = {
  /**
   * The cursor this page was fetched with (`undefined` for the first page), so
   * a page is replaced (not duplicated) if its query completes twice (e.g.
   * cache hit then network) and a stale completion can be told apart.
   */
  cursor: EntityQueryCursor | undefined;
  count?: number;
  entities: HashEntity[];
  nextCursor: EntityQueryCursor | null;
  subgraph: SearchSubgraph;
};

/** The running, incrementally-built accumulation of every entity page loaded. */
type EntityAccumulated = {
  entities: HashEntity[];
  /** Dedup set keyed on `recordId.entityId`, so appends stay O(page size). */
  seenEntityIds: Set<EntityId>;
  /** `undefined` until the first page supplies the subgraph to merge into. */
  subgraph: SearchSubgraph | undefined;
  count?: number;
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

const appendEntityPage = (
  prevAccumulated: EntityAccumulated,
  page: EntitySearchPage,
): { accumulated: EntityAccumulated; page: EntitySearchPage } => {
  const entities = [...prevAccumulated.entities];
  const seenEntityIds = new Set(prevAccumulated.seenEntityIds);
  for (const entity of page.entities) {
    const entityId = entity.metadata.recordId.entityId;
    if (!seenEntityIds.has(entityId)) {
      seenEntityIds.add(entityId);
      entities.push(entity);
    }
  }

  // Exhausted once a page returns fewer rows than the page size (incl. zero),
  // even if the API still handed back a non-null cursor. Cleared on the
  // normalized page so `getNextPage` stops paginating.
  const exhausted = page.entities.length < searchBarPageSize;

  return {
    accumulated: {
      entities,
      seenEntityIds,
      subgraph: prevAccumulated.subgraph
        ? mergeSubgraphInto(prevAccumulated.subgraph, page)
        : page.subgraph,
      count: page.count,
    },
    page: { ...page, nextCursor: exhausted ? null : page.nextCursor },
  };
};

/** The empty accumulation; the first page supplies the subgraph to merge into. */
const initialEntityAccumulated: EntityAccumulated = {
  entities: [],
  seenEntityIds: new Set<EntityId>(),
  subgraph: undefined,
};

/** Advance to the next page, or stop once a page has cleared its `nextCursor`. */
const getNextEntityPage = (page: EntitySearchPage): EntitySearchPage | false =>
  page.nextCursor === null ? false : { ...page, cursor: page.nextCursor };

// --- Entity types ----------------------------------------------------------

type EntityTypePage = {
  /**
   * The cursor this page was fetched with (`undefined` for the first page), so
   * a page is replaced (not duplicated) if its query completes twice (e.g.
   * cache hit then network) and a stale completion can be told apart.
   */
  cursor: VersionedUrl | undefined;
  count?: number;
  entityTypes: EntityType[];
  nextCursor: VersionedUrl | null;
};

type EntityTypeAccumulated = {
  entityTypes: EntityType[];
  /** Dedup set keyed on the type's versioned URL. */
  seenEntityTypeIds: Set<VersionedUrl>;
  count?: number;
};

const appendEntityTypePage = (
  prevAccumulated: EntityTypeAccumulated,
  page: EntityTypePage,
): { accumulated: EntityTypeAccumulated; page: EntityTypePage } => {
  const entityTypes = [...prevAccumulated.entityTypes];
  const seenEntityTypeIds = new Set(prevAccumulated.seenEntityTypeIds);
  for (const entityType of page.entityTypes) {
    if (!seenEntityTypeIds.has(entityType.$id)) {
      seenEntityTypeIds.add(entityType.$id);
      entityTypes.push(entityType);
    }
  }

  // Exhausted once a page returns fewer rows than the page size (incl. zero),
  // even if the API still handed back a non-null cursor. Cleared on the
  // normalized page so `getNextPage` stops paginating.
  const exhausted = page.entityTypes.length < searchBarPageSize;

  return {
    accumulated: {
      entityTypes,
      seenEntityTypeIds,
      count: page.count,
    },
    page: { ...page, nextCursor: exhausted ? null : page.nextCursor },
  };
};

/** The empty entity-type accumulation. */
const initialEntityTypeAccumulated: EntityTypeAccumulated = {
  entityTypes: [],
  seenEntityTypeIds: new Set<VersionedUrl>(),
};

/** Advance to the next page, or stop once a page has cleared its `nextCursor`. */
const getNextEntityTypePage = (page: EntityTypePage): EntityTypePage | false =>
  page.nextCursor === null ? false : { ...page, cursor: page.nextCursor };

/**
 * Fetches the search bar's results a page at a time, paginating across both
 * entities and entity types under a single `loadMore`/`hasMore`.
 *
 * Entities are loaded first; only once every matching entity has been loaded
 * (a page returned fewer than {@link searchBarPageSize} rows) does it start
 * loading entity types. This keeps the more relevant entity matches at the top
 * of the list and avoids querying for types until the entities are exhausted.
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
  entityTypes: EntityType[];
  subgraph?: SearchSubgraph;
  /** Whether the first page of entities is still loading. */
  initialLoading: boolean;
  /** Whether a subsequent page (of entities or entity types) is being fetched. */
  loadingMore: boolean;
  /** Fetch the next page (no-op if there are no more pages of either kind). */
  loadMore: () => void;
  /** Whether there are more pages (of either kind) to fetch. */
  hasMore: boolean;
} => {
  const {
    page: entityPage,
    appendPage: addEntityPage,
    accumulated: entityAccumulated,
    loadMore: loadMoreEntities,
    hasMore: hasMoreEntities,
  } = useAccumulatedCursorPagination<EntityAccumulated, EntitySearchPage>({
    resetKey,
    initial: initialEntityAccumulated,
    getNextPage: getNextEntityPage,
  });

  const { loading: entitiesLoading } = useQuery<
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
        includeCount: true,
        cursor: entityPage?.cursor,
        limit: searchBarPageSize,
        sortingPaths: [uuidSortingPath],
      },
    },
    onCompleted: (data) => {
      const subgraph = deserializeSubgraph<EntityRootType<HashEntity>>(
        data.queryEntitySubgraph.subgraph,
      );

      const loadedPage: EntitySearchPage = {
        cursor: entityPage?.cursor,
        count: data.queryEntitySubgraph.count ?? undefined,
        entities: getRoots(subgraph),
        nextCursor: data.queryEntitySubgraph.cursor ?? null,
        subgraph,
      };

      addEntityPage((prevAccumulated) =>
        appendEntityPage(prevAccumulated, loadedPage),
      );
    },
  });

  /**
   * Entities are exhausted once at least one page has loaded and there is no
   * further cursor. Gating the entity-type query on this means types are only
   * fetched after every entity match has been loaded.
   */
  const entitiesExhausted = entityAccumulated !== undefined && !hasMoreEntities;

  const {
    page: entityTypePage,
    appendPage: addEntityTypePage,
    accumulated: entityTypeAccumulated,
    loadMore: loadMoreEntityTypes,
    hasMore: hasMoreEntityTypes,
  } = useAccumulatedCursorPagination<EntityTypeAccumulated, EntityTypePage>({
    resetKey,
    initial: initialEntityTypeAccumulated,
    getNextPage: getNextEntityTypePage,
  });

  const { loading: entityTypesLoading } = useQuery<
    QueryEntityTypesQuery,
    QueryEntityTypesQueryVariables
  >(queryEntityTypesQuery, {
    fetchPolicy: "cache-and-network",
    skip: skip || !entitiesExhausted,
    variables: {
      request: {
        filter,
        temporalAxes: currentTimeInstantTemporalAxes,
        after: entityTypePage?.cursor,
        limit: searchBarPageSize,
        includeCount: true,
      },
    },
    onCompleted: (data) => {
      const loadedPage: EntityTypePage = {
        count: data.queryEntityTypes.count ?? undefined,
        cursor: entityTypePage?.cursor,
        entityTypes: data.queryEntityTypes.entityTypes.map(
          (entityType) => entityType.schema,
        ),
        nextCursor: data.queryEntityTypes.cursor ?? null,
      };

      addEntityTypePage((prevAccumulated) =>
        appendEntityTypePage(prevAccumulated, loadedPage),
      );
    },
  });

  const loadMore = useCallback(() => {
    if (hasMoreEntities) {
      loadMoreEntities();
    } else {
      loadMoreEntityTypes();
    }
  }, [hasMoreEntities, loadMoreEntities, loadMoreEntityTypes]);

  return {
    entities: entityAccumulated?.entities ?? [],
    entityTypes: entityTypeAccumulated?.entityTypes ?? [],
    subgraph: entityAccumulated?.subgraph,
    initialLoading: entitiesLoading && entityAccumulated === undefined,
    // A subsequent entity page (the request has advanced past the first) or any
    // entity-type page (which only ever loads after the entities are shown) is
    // "more".
    loadingMore:
      (entitiesLoading && entityPage !== undefined) || entityTypesLoading,
    loadMore,
    hasMore: hasMoreEntities || hasMoreEntityTypes,
  };
};
