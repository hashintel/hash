import { type ApolloError, useQuery } from "@apollo/client";

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
  typeIds?: Record<VersionedUrl, number>;
  typeTitles?: Record<VersionedUrl, string>;
  count?: number;
};

/** The empty accumulation; the first page supplies the subgraph to merge into. */
const initialAccumulated: Accumulated = {
  linkEntities: [],
  seenLinkIds: new Set<EntityId>(),
  subgraph: undefined,
  typesMap: {},
  definitions: undefined,
  typeIds: undefined,
  typeTitles: undefined,
  count: undefined,
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

  const { page, appendPage, accumulated, loadMore, hasMore } =
    useAccumulatedCursorPagination<
      Accumulated,
      { cursor: EntityQueryCursor | undefined }
    >({
      resetKey: `${entityId}:${direction}:${JSON.stringify(
        sortingPaths ?? null,
      )}:${JSON.stringify(filterTypeIds ?? null)}`,
      initial: initialAccumulated,
    });

  /**
   * The link endpoint that is the viewed entity: left/source for outgoing
   * links, right/target for incoming.
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
             * When viewing a specific draft, scope the endpoint to that draft
             * (mirroring `generateEntityIdFilter`); without it a draft would
             * match links across its live version and all sibling drafts.
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
            /**
             * Restrict matched links to the selected link types. `undefined`
             * means no filter (every type selected, the default), so the clause
             * is omitted. An empty array means every type deselected, which must
             * match *nothing* - an empty `any` resolves to a `FALSE` filter, so
             * the clause is still added.
             */
            ...(filterTypeIds
              ? [
                  {
                    any: filterTypeIds.map((versionedUrl) => ({
                      equal: [
                        { path: ["type", "versionedUrl"] },
                        { parameter: versionedUrl },
                      ],
                    })),
                  },
                ]
              : []),
          ],
        },
        cursor: page?.cursor,
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
        // Return the per-type breakdown and titles so the caller can offer
        // them as filter options (see {@link filterTypeIds}).
        includeTypeIds: true,
        includeTypeTitles: true,
      },
    },
    onCompleted: (data) => {
      const response = deserializeQueryEntitySubgraphResponse(
        data.queryEntitySubgraph,
      );

      const newLinkEntities = getRoots(response.subgraph).map(
        (rootEntity) => new HashLinkEntity(rootEntity),
      );

      appendPage((prevAccumulated) => {
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
            // A full-set aggregate returned identically on every page, so the latest
            // page's value replaces (rather than extends) it.
            typeIds:
              data.queryEntitySubgraph.typeIds ?? prevAccumulated.typeIds,
            typeTitles:
              data.queryEntitySubgraph.typeTitles ?? prevAccumulated.typeTitles,
            count: data.queryEntitySubgraph.count ?? undefined,
          },
          getNextPage:
            nextCursor === null ? false : () => ({ cursor: nextCursor }),
        };
      });
    },
  });

  return {
    error,
    initialLoading: loading && accumulated === undefined,
    loadingMore: loading && page !== undefined,
    loadMore,
    hasMore,
    count: accumulated?.count,
    linkEntities: accumulated?.linkEntities,
    subgraph: accumulated?.subgraph,
    linkAndDestinationEntitiesClosedMultiEntityTypesMap: accumulated?.typesMap,
    closedMultiEntityTypesDefinitions: accumulated?.definitions,
    typeIds: accumulated?.typeIds,
    typeTitles: accumulated?.typeTitles,
  };
};
