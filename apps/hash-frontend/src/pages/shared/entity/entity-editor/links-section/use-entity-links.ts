import { useQuery } from "@apollo/client";
import { useCallback, useEffect, useMemo, useState } from "react";

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

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../../graphql/api-types.gen";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type { EntityQueryCursor } from "@local/hash-graph-client";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";

/**
 * The number of links fetched per page for the readonly link tables.
 */
export const linksTablePageSize = 200;

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

const initialCursorKey = "__initial__";

const cursorKeyFor = (cursor: EntityQueryCursor | undefined) =>
  cursor ? JSON.stringify(cursor) : initialCursorKey;

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

const mergeSubgraphs = (pages: LinkPage[]): LinksSubgraph | undefined => {
  const [first, ...rest] = pages;
  if (!first) {
    return undefined;
  }

  return rest.reduce<LinksSubgraph>((merged, page) => {
    const vertices = mergeRecordOfRecords(
      merged.vertices as Record<string, Record<string, unknown>>,
      page.subgraph.vertices as Record<string, Record<string, unknown>>,
    ) as LinksSubgraph["vertices"];

    const edges = mergeRecordOfRecords(
      merged.edges as Record<string, Record<string, unknown>>,
      page.subgraph.edges as Record<string, Record<string, unknown>>,
    ) as LinksSubgraph["edges"];

    return { ...merged, vertices, edges };
  }, first.subgraph);
};

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
}: {
  direction: "outgoing" | "incoming";
  entityId: EntityId;
  skip?: boolean;
}): {
  /** Whether the first page is still loading. */
  initialLoading: boolean;
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

  const [cursor, setCursor] = useState<EntityQueryCursor | undefined>(
    undefined,
  );
  const [pages, setPages] = useState<LinkPage[]>([]);

  /**
   * Reset accumulated pages when the entity or direction changes (the query
   * identity, and therefore the cursors, are no longer valid).
   */
  useEffect(() => {
    setCursor(undefined);
    setPages([]);
  }, [entityId, direction]);

  /**
   * The endpoint of the link that is the entity being viewed: its left/source
   * entity for outgoing links, its right/target entity for incoming links.
   */
  const filterEndpoint =
    direction === "outgoing" ? "leftEntity" : "rightEntity";

  const { loading } = useQuery<
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
        sortingPaths: [
          { path: ["uuid"], ordering: "ascending", nulls: "last" },
        ],
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

      const page: LinkPage = {
        cursorKey: cursorKeyFor(cursor),
        count: data.queryEntitySubgraph.count ?? undefined,
        linkEntities: getRoots(response.subgraph).map(
          (rootEntity) => new HashLinkEntity(rootEntity),
        ),
        nextCursor: data.queryEntitySubgraph.cursor ?? null,
        subgraph: response.subgraph,
        typesMap: data.queryEntitySubgraph.closedMultiEntityTypes ?? {},
        definitions: data.queryEntitySubgraph.definitions ?? undefined,
      };

      setPages((previousPages) => {
        if (!cursor) {
          // First page – replace any accumulated pages.
          return [page];
        }

        const existingIndex = previousPages.findIndex(
          (previousPage) => previousPage.cursorKey === page.cursorKey,
        );

        if (existingIndex !== -1) {
          const next = [...previousPages];
          next[existingIndex] = page;
          return next;
        }

        return [...previousPages, page];
      });
    },
  });

  const accumulated = useMemo(() => {
    if (pages.length === 0) {
      return undefined;
    }

    const seenLinkIds = new Set<EntityId>();
    const linkEntities: HashLinkEntity[] = [];
    for (const page of pages) {
      for (const linkEntity of page.linkEntities) {
        const linkEntityId = linkEntity.metadata.recordId.entityId;
        if (!seenLinkIds.has(linkEntityId)) {
          seenLinkIds.add(linkEntityId);
          linkEntities.push(linkEntity);
        }
      }
    }

    const typesMap: ClosedMultiEntityTypesRootMap = {};
    let definitions: ClosedMultiEntityTypesDefinitions | undefined;
    for (const page of pages) {
      Object.assign(typesMap, page.typesMap);
      if (page.definitions) {
        definitions = definitions
          ? {
              dataTypes: {
                ...definitions.dataTypes,
                ...page.definitions.dataTypes,
              },
              entityTypes: {
                ...definitions.entityTypes,
                ...page.definitions.entityTypes,
              },
              propertyTypes: {
                ...definitions.propertyTypes,
                ...page.definitions.propertyTypes,
              },
            }
          : page.definitions;
      }
    }

    const lastPage = pages[pages.length - 1]!;

    return {
      linkEntities,
      subgraph: mergeSubgraphs(pages),
      typesMap,
      definitions,
      count: lastPage.count,
      nextCursor: lastPage.nextCursor,
    };
  }, [pages]);

  const loadMore = useCallback(() => {
    if (accumulated?.nextCursor) {
      setCursor(accumulated.nextCursor);
    }
  }, [accumulated?.nextCursor]);

  return {
    initialLoading: loading && pages.length === 0,
    loadingMore: loading && cursor !== undefined,
    loadMore,
    hasMore: !!accumulated?.nextCursor,
    count: accumulated?.count,
    linkEntities: accumulated?.linkEntities,
    subgraph: accumulated?.subgraph,
    linkAndDestinationEntitiesClosedMultiEntityTypesMap: accumulated?.typesMap,
    closedMultiEntityTypesDefinitions: accumulated?.definitions,
  };
};
