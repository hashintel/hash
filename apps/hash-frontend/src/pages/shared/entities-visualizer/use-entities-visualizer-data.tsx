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

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
  SummarizeEntitiesQuery,
  SummarizeEntitiesQueryVariables,
} from "../../../graphql/api-types.gen";
import type { VisualizerView } from "../visualizer-views";
import type { EntitiesFilterState } from "./shared/filter-state";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type { BaseUrl, VersionedUrl, WebId } from "@blockprotocol/type-system";
import type {
  EntityQueryCursor,
  EntityQuerySortingRecord,
} from "@local/hash-graph-client";

export type EntitiesVisualizerData = Partial<
  Pick<
    QueryEntitySubgraphQuery["queryEntitySubgraph"],
    "closedMultiEntityTypes" | "definitions"
  >
> & {
  cursor?: EntityQueryCursor | null;
  entities?: HashEntity[];
  /** Set when the page query failed. */
  error?: Error;
  hadCachedContent: boolean;
  loading: boolean;
  /**
   * Refetches the page query. Resolves to `undefined` without querying while
   * the type universe is still awaited.
   */
  refetch: () => Promise<unknown>;
  subgraph?: Subgraph<EntityRootType<HashEntity>>;
  totalResultCount: number | null;
};

/**
 * Reads the Grid and Graph views' data through `queryEntitySubgraph`. The
 * Table view reads through `useEntitiesTableQuery` instead, which skips the
 * queries here.
 */
export const useEntitiesVisualizerData = (params: {
  conversions?: ConversionRequest[];
  cursor?: EntityQueryCursor;
  entityTypeBaseUrl?: BaseUrl;
  entityTypeIds?: VersionedUrl[];
  filterState: EntitiesFilterState;
  internalWebs: { webId: WebId }[];
  limit: number;
  sort?: EntityQuerySortingRecord;
  /**
   * The type universe from `useAvailableTypes` — `null` while the summary is in
   * flight, and permanently for pinned types, which never fetch it. The default
   * (no type selection) view sends it as an include-type clause and holds its
   * queries back until it is available — see {@link buildEntitiesFilter}.
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
    internalWebs,
    limit,
    sort,
    typeUniverse,
    typeUniverseError,
    view,
  } = params;

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

  const awaitingTypeUniverse =
    typeUniverse === null &&
    !entityTypeBaseUrl &&
    !entityTypeIds?.length &&
    filterState.type.selectedTypeIds === null;

  const skip = view === "Table" || awaitingTypeUniverse;

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
    skip,
    variables: {
      request: {
        filter,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includeCount: true,
      },
    },
  });

  const { data, error, loading, refetch } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    fetchPolicy: "cache-and-network",
    skip,
    variables,
  });

  // Apollo's refetch punches through `skip`, and while the gate holds the built
  // filter has no type clause at all — exactly the unestimable shape the gate
  // exists to prevent. Drop the call instead.
  const guardedRefetch = useCallback(async () => {
    if (skip) {
      return undefined;
    }

    return refetch();
  }, [skip, refetch]);

  const hadCachedContent = useMemo(
    () =>
      !!apolloClient.readQuery({
        query: queryEntitySubgraphQuery,
        variables,
      }),
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
      error,
      hadCachedContent,
      loading: loading || (awaitingTypeUniverse && !typeUniverseError),
      refetch: guardedRefetch,
      subgraph,
      totalResultCount: summaryData?.summarizeEntities.count ?? null,
    }),
    [
      data?.queryEntitySubgraph,
      summaryData?.summarizeEntities,
      entities,
      error,
      hadCachedContent,
      loading,
      awaitingTypeUniverse,
      typeUniverseError,
      guardedRefetch,
      subgraph,
    ],
  );
};
