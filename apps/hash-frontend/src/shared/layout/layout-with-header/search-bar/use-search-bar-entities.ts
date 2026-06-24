import { useQuery } from "@apollo/client";

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

/**
 * The search paginates across two phases under a single cursor: every matching
 * entity first, then the entity types. A page is tagged with the phase it
 * belongs to (`kind`) so one query/fold/cursor-advance can be picked per page,
 * and carries the `cursor` it was fetched with so a re-completion of the same
 * query (cache then network) replaces rather than duplicates it.
 */
type EntityPage = {
  kind: "entity";
  cursor: EntityQueryCursor | undefined;
  nextCursor: EntityQueryCursor | null;
};

type EntityTypePage = {
  kind: "entityType";
  cursor: VersionedUrl | undefined;
  nextCursor: VersionedUrl | null;
};

type SearchPage = EntityPage | EntityTypePage;

type SearchAccumulated = {
  entities: HashEntity[];
  /** Dedup set keyed on `recordId.entityId`, so appends stay O(page size). */
  seenEntityIds: Set<EntityId>;
  /** `undefined` until the first entity page supplies the subgraph to merge into. */
  subgraph: SearchSubgraph | undefined;
  entityTypes: EntityType[];
  /** Dedup set keyed on the type's versioned URL. */
  seenEntityTypeIds: Set<VersionedUrl>;
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
  incoming: SearchSubgraph,
): SearchSubgraph => {
  const vertices = mergeRecordOfRecords(
    merged.vertices as Record<string, Record<string, unknown>>,
    incoming.vertices as Record<string, Record<string, unknown>>,
  ) as SearchSubgraph["vertices"];

  const edges = mergeRecordOfRecords(
    merged.edges as Record<string, Record<string, unknown>>,
    incoming.edges as Record<string, Record<string, unknown>>,
  ) as SearchSubgraph["edges"];

  return { ...merged, vertices, edges };
};

/** The empty accumulation; the first entity page supplies the subgraph to merge into. */
const initialSearchAccumulated: SearchAccumulated = {
  entities: [],
  seenEntityIds: new Set<EntityId>(),
  subgraph: undefined,
  entityTypes: [],
  seenEntityTypeIds: new Set<VersionedUrl>(),
};

/**
 * Advance the cursor within a phase, cross over from entities to entity types
 * once the entities are exhausted, or stop once the entity types are too.
 */
const getNextSearchPage = (page: SearchPage): SearchPage | false => {
  if (page.kind === "entity") {
    if (page.nextCursor !== null) {
      return { ...page, cursor: page.nextCursor };
    }
    // Entities exhausted: begin the entity-type phase from its first page.
    return {
      kind: "entityType",
      cursor: undefined,
      nextCursor: null,
    };
  }

  return page.nextCursor !== null
    ? { ...page, cursor: page.nextCursor }
    : false;
};

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
  const { page, accumulated, appendPage, loadMore, hasMore } =
    useAccumulatedCursorPagination<SearchAccumulated, SearchPage>({
      resetKey,
      initial: initialSearchAccumulated,
      getNextPage: getNextSearchPage,
    });

  const { loading: entitiesLoading } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    fetchPolicy: "cache-and-network",
    // The first page (`page` undefined) and every entity page is fetched here;
    // skip once the cursor has crossed over to the entity-type phase.
    skip: skip || page?.kind === "entityType",
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
        cursor: page?.kind === "entity" ? page.cursor : undefined,
        limit: searchBarPageSize,
        sortingPaths: [uuidSortingPath],
      },
    },
    onCompleted: (data) => {
      const subgraph = deserializeSubgraph<EntityRootType<HashEntity>>(
        data.queryEntitySubgraph.subgraph,
      );
      const newEntities = getRoots(subgraph);

      // Exhausted once a page returns fewer rows than the page size (incl. zero),
      // even if the API still handed back a non-null cursor. Cleared on the
      // normalized page so `getNextPage` stops paginating.
      const exhausted = newEntities.length < searchBarPageSize;

      appendPage((prevAccumulated) => {
        const entities = [...prevAccumulated.entities];

        const seenEntityIds = new Set(prevAccumulated.seenEntityIds);
        for (const entity of newEntities) {
          const entityId = entity.metadata.recordId.entityId;
          if (!seenEntityIds.has(entityId)) {
            seenEntityIds.add(entityId);
            entities.push(entity);
          }
        }
        // console.log(page?.cursor, data.queryEntitySubgraph.cursor ?? null)

        return {
          accumulated: {
            ...prevAccumulated,
            entities,
            seenEntityIds,
            subgraph: prevAccumulated.subgraph
              ? mergeSubgraphInto(prevAccumulated.subgraph, subgraph)
              : subgraph,
          },
          page: exhausted
            ? {
                kind: "entityType",
                cursor: undefined,
                nextCursor: null,
              }
            : {
                kind: "entity",
                cursor: page?.kind === "entity" ? page.cursor : undefined,
                nextCursor: data.queryEntitySubgraph.cursor ?? null,
              },
        };
      });
    },
  });

  const { loading: entityTypesLoading } = useQuery<
    QueryEntityTypesQuery,
    QueryEntityTypesQueryVariables
  >(queryEntityTypesQuery, {
    fetchPolicy: "cache-and-network",
    // Only fires once the cursor has crossed over to the entity-type phase.
    skip: skip || page?.kind !== "entityType",
    variables: {
      request: {
        filter,
        temporalAxes: currentTimeInstantTemporalAxes,
        after: page?.kind === "entityType" ? page.cursor : undefined,
        limit: searchBarPageSize,
        includeCount: true,
      },
    },
    onCompleted: (data) => {
      const newEntityTypes = data.queryEntityTypes.entityTypes.map(
        (entityType) => entityType.schema,
      );

      // Exhausted once a page returns fewer rows than the page size (incl. zero),
      // even if the API still handed back a non-null cursor. Cleared on the
      // normalized page so `getNextPage` stops paginating.
      const exhausted = newEntityTypes.length < searchBarPageSize;

      appendPage((prevAccumulated) => {
        const entityTypes = [...prevAccumulated.entityTypes];
        const seenEntityTypeIds = new Set(prevAccumulated.seenEntityTypeIds);
        for (const entityType of newEntityTypes) {
          if (!seenEntityTypeIds.has(entityType.$id)) {
            seenEntityTypeIds.add(entityType.$id);
            entityTypes.push(entityType);
          }
        }

        return {
          accumulated: {
            ...prevAccumulated,
            entityTypes,
            seenEntityTypeIds,
          },
          page: {
            kind: "entityType",
            cursor: page?.kind === "entityType" ? page.cursor : undefined,
            nextCursor: exhausted
              ? null
              : (data.queryEntityTypes.cursor ?? null),
          },
        };
      });
    },
  });

  return {
    entities: accumulated?.entities ?? [],
    entityTypes: accumulated?.entityTypes ?? [],
    subgraph: accumulated?.subgraph,
    initialLoading: entitiesLoading && accumulated === undefined,
    // A subsequent entity page (the cursor has advanced past the first) or any
    // entity-type page (which only ever loads after the entities are shown) is
    // "more".
    loadingMore:
      (entitiesLoading && page?.kind === "entity") || entityTypesLoading,
    loadMore,
    hasMore,
  };
};
