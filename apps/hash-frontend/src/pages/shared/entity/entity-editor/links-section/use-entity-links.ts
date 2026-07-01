import { type ApolloError, useQuery } from "@apollo/client";
import { useMemo } from "react";

import { getRoots } from "@blockprotocol/graph/stdlib";
import {
  type EntityId,
  splitEntityId,
  type VersionedUrl,
} from "@blockprotocol/type-system";
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

import { summarizeEntitiesQuery } from "../../../../../graphql/queries/knowledge/entity.queries";
import { useAccumulatedCursorPagination } from "./use-accumulated-cursor-pagination";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
  SummarizeEntitiesQuery,
  SummarizeEntitiesQueryVariables,
} from "../../../../../graphql/api-types.gen";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type {
  EntityQueryCursor,
  EntityQuerySortingRecord,
  Filter,
} from "@local/hash-graph-client";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";

/** Links fetched per page for the readonly link tables. */
export const linksTablePageSize = 100;

type LinksSubgraph = Subgraph<EntityRootType<HashEntity>>;

/**
 * Appended to any caller sorting so pagination is deterministic: the unique
 * `uuid` breaks ties when sorting by a non-unique field (label, type title).
 */
const uuidSortingPath: EntityQuerySortingRecord = {
  path: ["uuid"],
  ordering: "ascending",
  nulls: "last",
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

/** Merge a later page's subgraph into the accumulated one. */
const mergeSubgraphInto = (
  merged: LinksSubgraph,
  subgraph: LinksSubgraph,
): LinksSubgraph => {
  const vertices = mergeRecordOfRecords(
    merged.vertices as Record<string, Record<string, unknown>>,
    subgraph.vertices as Record<string, Record<string, unknown>>,
  ) as LinksSubgraph["vertices"];

  const edges = mergeRecordOfRecords(
    merged.edges as Record<string, Record<string, unknown>>,
    subgraph.edges as Record<string, Record<string, unknown>>,
  ) as LinksSubgraph["edges"];

  return { ...merged, vertices, edges };
};

const mergeDefinitionsInto = (
  merged: ClosedMultiEntityTypesDefinitions | undefined,
  definitions?: ClosedMultiEntityTypesDefinitions,
): ClosedMultiEntityTypesDefinitions | undefined => {
  if (!definitions) {
    return merged;
  }
  if (!merged) {
    return definitions;
  }
  return {
    dataTypes: { ...merged.dataTypes, ...definitions.dataTypes },
    entityTypes: { ...merged.entityTypes, ...definitions.entityTypes },
    propertyTypes: {
      ...merged.propertyTypes,
      ...definitions.propertyTypes,
    },
  };
};

/** The running, incrementally-built accumulation of every page loaded so far. */
type Accumulated = {
  linkEntities: HashLinkEntity[];
  /** Dedup set keyed on `recordId.entityId`, so appends stay O(page size). */
  seenLinkIds: Set<EntityId>;
  /** `undefined` until the first page supplies the subgraph to merge into. */
  subgraph: LinksSubgraph | undefined;
  typesMap: ClosedMultiEntityTypesRootMap;
  definitions?: ClosedMultiEntityTypesDefinitions;
};

/** The empty accumulation; the first page supplies the subgraph to merge into. */
const initialAccumulated: Accumulated = {
  linkEntities: [],
  seenLinkIds: new Set<EntityId>(),
  subgraph: undefined,
  typesMap: {},
  definitions: undefined,
};

/**
 * Fetches an entity's incoming or outgoing links a page at a time, for the
 * readonly link tables.
 *
 * Only used for readonly link data; when editable, links come from the editor
 * subgraph and are not paginated.
 */
export const useEntityLinks = ({
  direction,
  entityId,
  filterTypeIds,
  skip = false,
  sortingPaths,
}: {
  direction: "outgoing" | "incoming";
  entityId: EntityId;
  // If set, restrict matched links to these link entity type ids. Applied server-side
  filterTypeIds?: VersionedUrl[];
  skip?: boolean;
  // How to sort the links server-side; a `uuid` tiebreaker is always appended to keep pagination stable.
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
  /** The count of matching links by their link entity type id. */
  typeIds?: Record<VersionedUrl, number>;
  /** The title of each link entity type present in {@link typeIds}. */
  typeTitles?: Record<VersionedUrl, string>;
} => {
  const [webId, entityUuid, draftId] = splitEntityId(entityId);

  const resetKey = `${entityId}:${direction}:${JSON.stringify(
    sortingPaths ?? null,
  )}:${JSON.stringify(filterTypeIds ?? null)}`;

  const { page, appendPage, accumulated, loadMore, hasMore } =
    useAccumulatedCursorPagination<
      Accumulated,
      { cursor: EntityQueryCursor | undefined }
    >({
      resetKey,
      initial: initialAccumulated,
    });

  /**
   * The link endpoint that is the viewed entity: left/source for outgoing
   * links, right/target for incoming.
   */
  const filterEndpoint =
    direction === "outgoing" ? "leftEntity" : "rightEntity";

  /**
   * The filter clauses common to every query: scope to the viewed entity (and
   * draft) via the relevant link endpoint, and (for incoming links) exclude
   * noisy system types and claims. This deliberately omits any
   * {@link filterTypeIds} clause.
   */
  const baseFilterClauses = useMemo<Filter[]>(() => {
    const clauses: Filter[] = [
      {
        equal: [{ path: [filterEndpoint, "uuid"] }, { parameter: entityUuid }],
      },
      {
        equal: [{ path: [filterEndpoint, "webId"] }, { parameter: webId }],
      },
    ];

    /**
     * When viewing a specific draft, scope the endpoint to that draft
     * (mirroring `generateEntityIdFilter`); without it a draft would match
     * links across its live version and all sibling drafts.
     */
    if (draftId) {
      clauses.push({
        equal: [{ path: [filterEndpoint, "draftId"] }, { parameter: draftId }],
      });
    }

    if (direction === "incoming") {
      clauses.push(ignoreNoisySystemTypesFilter, {
        notEqual: [
          { path: ["leftEntity", "type", "versionedUrl"] },
          { parameter: systemEntityTypes.claim.entityTypeId },
        ],
      });
    }

    return clauses;
  }, [direction, draftId, entityUuid, filterEndpoint, webId]);

  /**
   * Restrict matched links to the selected link types. `undefined` means no
   * filter (every type selected, the default), so the clause is omitted. An
   * empty array means every type deselected, which must match *nothing* - an
   * empty `any` resolves to a `FALSE` filter, so the clause is still added.
   */
  const typeFilterClause = useMemo<Filter | null>(() => {
    if (!filterTypeIds) {
      return null;
    }

    return {
      any: filterTypeIds.map((versionedUrl) => ({
        equal: [
          { path: ["type", "versionedUrl"] },
          { parameter: versionedUrl },
        ],
      })),
    };
  }, [filterTypeIds]);

  /** The full filter for the matched links, including any type filter. */
  const filter = useMemo<Filter>(
    () => ({
      all: typeFilterClause
        ? [...baseFilterClauses, typeFilterClause]
        : baseFilterClauses,
    }),
    [baseFilterClauses, typeFilterClause],
  );

  /**
   * The same filter without any type filter, used to offer the type filter
   * options: we want the types present in the result set *before* the user
   * narrows by type.
   */
  const filterWithoutTypeFilter = useMemo<Filter>(
    () => ({ all: baseFilterClauses }),
    [baseFilterClauses],
  );

  const { loading, error } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    fetchPolicy: "cache-and-network",
    skip,
    variables: {
      request: {
        filter,
        cursor: page?.cursor,
        limit: linksTablePageSize,
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

      const newLinkEntities = getRoots(response.subgraph).map(
        (rootEntity) => new HashLinkEntity(rootEntity),
      );

      appendPage(resetKey, (prevAccumulated) => {
        const linkEntities = [...prevAccumulated.linkEntities];
        const seenLinkIds = new Set(prevAccumulated.seenLinkIds);
        for (const linkEntity of newLinkEntities) {
          const linkEntityId = linkEntity.metadata.recordId.entityId;
          if (!seenLinkIds.has(linkEntityId)) {
            seenLinkIds.add(linkEntityId);
            linkEntities.push(linkEntity);
          }
        }

        // Exhausted once a page returns fewer rows than the page size (incl. zero),
        // even if the API still handed back a non-null cursor; `getNextPage` is
        // then `false` so pagination stops.
        const exhausted = newLinkEntities.length < linksTablePageSize;
        const nextCursor = exhausted
          ? null
          : (data.queryEntitySubgraph.cursor ?? null);

        return {
          accumulated: {
            linkEntities,
            seenLinkIds,
            subgraph: prevAccumulated.subgraph
              ? mergeSubgraphInto(prevAccumulated.subgraph, response.subgraph)
              : response.subgraph,
            typesMap: {
              ...prevAccumulated.typesMap,
              ...(data.queryEntitySubgraph.closedMultiEntityTypes ?? {}),
            },
            definitions: mergeDefinitionsInto(
              prevAccumulated.definitions,
              data.queryEntitySubgraph.definitions ?? undefined,
            ),
          },
          getNextPage:
            nextCursor === null ? false : () => ({ cursor: nextCursor }),
        };
      });
    },
  });

  /**
   * The total number of matching links. Fetched separately from the paginated
   * query above so it reflects the *full* matching set (with the type filter
   * applied), not just the current page.
   */
  const { data: countData } = useQuery<
    SummarizeEntitiesQuery,
    SummarizeEntitiesQueryVariables
  >(summarizeEntitiesQuery, {
    fetchPolicy: "cache-and-network",
    skip,
    variables: {
      request: {
        filter,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: !!draftId,
        includeCount: true,
      },
    },
  });

  /**
   * The per-type breakdown and titles offered as type filter options. Fetched
   * with the type filter omitted, so the caller can always offer every type
   * present in the (otherwise) matching set, even once a subset is selected.
   */
  const { data: typesData } = useQuery<
    SummarizeEntitiesQuery,
    SummarizeEntitiesQueryVariables
  >(summarizeEntitiesQuery, {
    fetchPolicy: "cache-and-network",
    skip,
    variables: {
      request: {
        filter: filterWithoutTypeFilter,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: !!draftId,
        includeTypeIds: true,
        includeTypeTitles: true,
      },
    },
  });

  return {
    error,
    initialLoading: loading && accumulated === undefined,
    loadingMore: loading && page !== undefined,
    loadMore,
    hasMore,
    count: countData?.summarizeEntities.count ?? undefined,
    linkEntities: accumulated?.linkEntities,
    subgraph: accumulated?.subgraph,
    linkAndDestinationEntitiesClosedMultiEntityTypesMap: accumulated?.typesMap,
    closedMultiEntityTypesDefinitions: accumulated?.definitions,
    typeIds: typesData?.summarizeEntities.typeIds ?? undefined,
    typeTitles: typesData?.summarizeEntities.typeTitles ?? undefined,
  };
};
