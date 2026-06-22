import { type ApolloError, useQuery } from "@apollo/client";

import { getRoots } from "@blockprotocol/graph/stdlib";
import { type EntityId, splitEntityId } from "@blockprotocol/type-system";
import {
  deserializeQueryEntitySubgraphResponse,
  HashLinkEntity,
} from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  ignoreNoisySystemTypesFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { queryEntitySubgraphQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { useAccumulatedCursorPagination } from "./use-accumulated-cursor-pagination";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../../graphql/api-types.gen";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type {
  EntityQueryCursor,
  EntityQuerySortingRecord,
} from "@local/hash-graph-client";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";

/**
 * The number of links fetched per page for the readonly link tables.
 */
export const linksTablePageSize = 100;

type LinksSubgraph = Subgraph<EntityRootType<HashEntity>>;

type LinkPage = {
  /**
   * A key identifying which cursor produced this page, so that a page is
   * replaced (rather than duplicated) if its query completes more than once
   * (e.g. a cache hit followed by a network response).
   */
  cursorKey: string;
  count?: number;
  linkEntities: HashLinkEntity[];
  nextCursor: EntityQueryCursor | null;
  subgraph: LinksSubgraph;
  typesMap: ClosedMultiEntityTypesRootMap;
  definitions?: ClosedMultiEntityTypesDefinitions;
};

/**
 * Appended to any caller-provided sorting so that pagination is deterministic
 * (the `uuid` is unique, breaking ties when sorting by a non-unique field such
 * as a label or type title).
 */
const uuidSortingPath: EntityQuerySortingRecord = {
  path: ["uuid"],
  ordering: "ascending",
  nulls: "last",
};

/**
 * Shallow-merge two `{ [baseId]: { [revisionId]: value } }` records (the shape
 * of a subgraph's `vertices` and `edges`), so that revisions from later pages
 * are added without dropping those from earlier pages.
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
 * Merge a single later page's subgraph into an already-merged subgraph,
 * adding its vertices/edges without dropping those already accumulated.
 */
const mergeSubgraphInto = (
  merged: LinksSubgraph,
  page: LinkPage,
): LinksSubgraph => {
  const vertices = mergeRecordOfRecords(
    merged.vertices as Record<string, Record<string, unknown>>,
    page.subgraph.vertices as Record<string, Record<string, unknown>>,
  ) as LinksSubgraph["vertices"];

  const edges = mergeRecordOfRecords(
    merged.edges as Record<string, Record<string, unknown>>,
    page.subgraph.edges as Record<string, Record<string, unknown>>,
  ) as LinksSubgraph["edges"];

  return { ...merged, vertices, edges };
};

const mergeDefinitionsInto = (
  merged: ClosedMultiEntityTypesDefinitions | undefined,
  page: LinkPage,
): ClosedMultiEntityTypesDefinitions | undefined => {
  if (!page.definitions) {
    return merged;
  }
  if (!merged) {
    return page.definitions;
  }
  return {
    dataTypes: { ...merged.dataTypes, ...page.definitions.dataTypes },
    entityTypes: { ...merged.entityTypes, ...page.definitions.entityTypes },
    propertyTypes: {
      ...merged.propertyTypes,
      ...page.definitions.propertyTypes,
    },
  };
};

/**
 * The running, incrementally-built accumulation of every page loaded so far.
 */
type Accumulated = {
  linkEntities: HashLinkEntity[];
  /** Dedup set keyed on `recordId.entityId`, so appends stay O(page size). */
  seenLinkIds: Set<EntityId>;
  subgraph: LinksSubgraph;
  typesMap: ClosedMultiEntityTypesRootMap;
  definitions?: ClosedMultiEntityTypesDefinitions;
  count?: number;
  nextCursor: EntityQueryCursor | null;
  /**
   * Whether the query is exhausted. `true` once a page returns fewer rows than
   * the requested page size (so a non-null cursor pointing past the last match
   * does not keep `hasMore` true and trigger an empty fetch).
   */
  exhausted: boolean;
};

/**
 * Fold a single freshly-loaded page into the running accumulation. The
 * `linkEntities`/`seenLinkIds`/`typesMap` collections are extended in place so
 * that loading page `k` costs O(page size) rather than O(total pages loaded so
 * far); a new top-level object is returned to carry the updated scalar fields.
 */
const appendPage = (accumulated: Accumulated, page: LinkPage): Accumulated => {
  for (const linkEntity of page.linkEntities) {
    const linkEntityId = linkEntity.metadata.recordId.entityId;
    if (!accumulated.seenLinkIds.has(linkEntityId)) {
      accumulated.seenLinkIds.add(linkEntityId);
      accumulated.linkEntities.push(linkEntity);
    }
  }

  Object.assign(accumulated.typesMap, page.typesMap);

  /**
   * Treat the result as exhausted when the page returned fewer rows than the
   * requested page size (including zero), regardless of whether the API still
   * handed back a non-null cursor.
   */
  const exhausted = page.linkEntities.length < linksTablePageSize;

  return {
    ...accumulated,
    definitions: mergeDefinitionsInto(accumulated.definitions, page),
    subgraph: mergeSubgraphInto(accumulated.subgraph, page),
    count: page.count,
    exhausted,
    nextCursor: exhausted ? null : page.nextCursor,
  };
};

/**
 * The empty accumulation, seeded with the first page's subgraph as the base to
 * merge subsequent pages into.
 */
const seedAccumulated = (firstPage: LinkPage): Accumulated => ({
  linkEntities: [],
  seenLinkIds: new Set<EntityId>(),
  subgraph: firstPage.subgraph,
  typesMap: {},
  definitions: undefined,
  count: undefined,
  nextCursor: null,
  exhausted: false,
});

/**
 * Return a fresh top-level object (and a fresh `linkEntities` array) so that
 * consumers depending on referential identity recompute when a page is
 * appended. The expensive O(n) work (dedup, subgraph/type merging) is done
 * incrementally by {@link appendPage}, which mutates `linkEntities` in place;
 * this only copies the array of entity references.
 */
const finalizeAccumulated = (accumulated: Accumulated): Accumulated => ({
  ...accumulated,
  linkEntities: [...accumulated.linkEntities],
});

/**
 * Fetches an entity's incoming or outgoing links a page at a time, for display
 * in the readonly link tables.
 *
 * The query is rooted on the *link entities* (filtered by the endpoint that is
 * the entity being viewed) rather than on the entity itself, so that `limit` /
 * `cursor` / `includeCount` paginate the links. Each page is accumulated, and
 * `loadMore` fetches the next page.
 *
 * This is only used when the link data is readonly; when the entity is editable
 * the links are part of the editor subgraph and are not paginated.
 */
export const useEntityLinks = ({
  direction,
  entityId,
  skip = false,
  sortingPaths,
}: {
  direction: "outgoing" | "incoming";
  entityId: EntityId;
  skip?: boolean;
  /**
   * How to sort the links server-side. A `uuid` tiebreaker is always appended
   * so that pagination remains stable. Changing this resets pagination (the
   * accumulated pages and their cursors are no longer valid).
   */
  sortingPaths?: EntityQuerySortingRecord[];
}): {
  /** Whether the first page is still loading. */
  initialLoading: boolean;
  /** Any error from the underlying query, for the caller to surface. */
  error?: ApolloError;
  /** Whether a subsequent page is being fetched. */
  loadingMore: boolean;
  /** Fetch the next page (no-op if there are no more pages). */
  loadMore: () => void;
  /** Whether there are more pages to fetch. */
  hasMore: boolean;
  /** The total number of links matching the query. */
  count?: number;
  /** The accumulated link entities loaded so far. */
  linkEntities?: HashLinkEntity[];
  /** A subgraph containing the loaded links and their source/target entities. */
  subgraph?: LinksSubgraph;
  linkAndDestinationEntitiesClosedMultiEntityTypesMap?: ClosedMultiEntityTypesRootMap;
  closedMultiEntityTypesDefinitions?: ClosedMultiEntityTypesDefinitions;
} => {
  const [webId, entityUuid, draftId] = splitEntityId(entityId);

  /**
   * Accumulate pages across `loadMore` calls. Changing the entity, direction or
   * sort resets the accumulation (the query identity, and therefore the
   * cursors, are no longer valid).
   */
  const {
    cursor,
    cursorKey,
    pageCount,
    addPage,
    accumulated,
    loadMore,
    hasMore,
  } = useAccumulatedCursorPagination<EntityQueryCursor, LinkPage, Accumulated>({
    resetKey: `${entityId}:${direction}:${JSON.stringify(
      sortingPaths ?? null,
    )}`,
    seed: seedAccumulated,
    appendPage,
    finalize: finalizeAccumulated,
  });

  /**
   * The endpoint of the link that is the entity being viewed: its left/source
   * entity for outgoing links, its right/target entity for incoming links.
   */
  const filterEndpoint =
    direction === "outgoing" ? "leftEntity" : "rightEntity";

  const { loading, error } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    fetchPolicy: "cache-and-network",
    skip,
    variables: {
      request: {
        filter: {
          all: [
            {
              equal: [
                { path: [filterEndpoint, "uuid"] },
                { parameter: entityUuid },
              ],
            },
            {
              equal: [
                { path: [filterEndpoint, "webId"] },
                { parameter: webId },
              ],
            },
            /**
             * When viewing a specific draft, scope the matched endpoint to that
             * draft. The path is rooted on the link entity, so this resolves
             * the *endpoint* entity's own draftId (mirroring
             * `generateEntityIdFilter`); without it a draft would match links
             * across its live version and all sibling drafts.
             */
            ...(draftId
              ? [
                  {
                    equal: [
                      { path: [filterEndpoint, "draftId"] },
                      { parameter: draftId },
                    ],
                  },
                ]
              : []),
            ...(direction === "incoming"
              ? [
                  ignoreNoisySystemTypesFilter,
                  {
                    notEqual: [
                      { path: ["leftEntity", "type", "versionedUrl"] },
                      {
                        parameter: systemEntityTypes.claim.entityTypeId,
                      },
                    ],
                  },
                ]
              : []),
          ],
        },
        cursor,
        limit: linksTablePageSize,
        includeCount: true,
        sortingPaths: [...(sortingPaths ?? []), uuidSortingPath],
        temporalAxes: currentTimeInstantTemporalAxes,
        traversalPaths: [
          { edges: [{ kind: "has-right-entity", direction: "outgoing" }] },
          { edges: [{ kind: "has-left-entity", direction: "outgoing" }] },
        ],
        includeDrafts: !!draftId,
        includeEntityTypes: "resolvedWithDataTypeChildren",
        includePermissions: false,
      },
    },
    onCompleted: (data) => {
      const response = deserializeQueryEntitySubgraphResponse(
        data.queryEntitySubgraph,
      );

      addPage({
        cursorKey,
        count: data.queryEntitySubgraph.count ?? undefined,
        linkEntities: getRoots(response.subgraph).map(
          (rootEntity) => new HashLinkEntity(rootEntity),
        ),
        nextCursor: data.queryEntitySubgraph.cursor ?? null,
        subgraph: response.subgraph,
        typesMap: data.queryEntitySubgraph.closedMultiEntityTypes ?? {},
        definitions: data.queryEntitySubgraph.definitions ?? undefined,
      });
    },
  });

  return {
    initialLoading: loading && pageCount === 0,
    error,
    loadingMore: loading && cursor !== undefined,
    loadMore,
    hasMore,
    count: accumulated?.count,
    linkEntities: accumulated?.linkEntities,
    subgraph: accumulated?.subgraph,
    linkAndDestinationEntitiesClosedMultiEntityTypesMap: accumulated?.typesMap,
    closedMultiEntityTypesDefinitions: accumulated?.definitions,
  };
};
