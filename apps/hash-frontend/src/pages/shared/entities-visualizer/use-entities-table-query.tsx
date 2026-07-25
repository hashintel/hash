import { useQuery } from "@apollo/client";
import * as Sentry from "@sentry/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { noisySystemBaseUrls } from "@local/hash-isomorphic-utils/graph-queries";

import { queryEntitiesTableQuery } from "../../../graphql/queries/knowledge/entity.queries";
import { buildEndpointPropertyFilter } from "./shared/property-filters/build-property-filter-clause";
import { cursorInEffect } from "./use-entities-table-query/cursor-in-effect";
import { generateTableDataFromEndpointRows } from "./use-entities-table-query/generate-table-data-from-endpoint-rows";

import type {
  QueryEntitiesTableQuery,
  QueryEntitiesTableQueryVariables,
} from "../../../graphql/api-types.gen";
import type {
  EntitiesTableData,
  EntitiesTableRow,
} from "./entities-table-data";
import type { EntitiesFilterState } from "./shared/filter-state";
import type { TableDataAggregates } from "./use-entities-table-query/generate-table-data-from-endpoint-rows";
import type { VersionedUrl, WebId } from "@blockprotocol/type-system";
import type { EntityTableSorting } from "@local/hash-graph-client";
import type {
  ConversionRequest,
  EntityTableSummary,
  EntityTableWebScope,
} from "@local/hash-graph-sdk/entity";
import type {
  ClosedMultiEntityTypesRootMap,
  EntityTypeResolveDefinitions,
} from "@local/hash-graph-sdk/ontology";

export type EntitiesTableQueryData = {
  /** Whether a further page is available — see {@link loadMore}. */
  canLoadMore: boolean;
  /** The closed types of every accumulated page, deep-merged. */
  closedMultiEntityTypes: ClosedMultiEntityTypesRootMap | null;
  /**
   * The rows in {@link tableData} belong to a previous request while the
   * current one has not produced a page yet — kept so a failed refresh does
   * not blank the table.
   */
  dataIsStale: boolean;
  /** The type definitions of every accumulated page, merged. */
  definitions: EntityTypeResolveDefinitions | null;
  /**
   * A failed page query or a response the table could not process. Pages
   * already on screen stay in {@link tableData} so the error can be shown
   * alongside them.
   */
  error?: Error;
  loading: boolean;
  /** Appends the next page to {@link tableData}. */
  loadMore: () => void;
  /** Reads the sequence again from its first page. */
  restart: () => Promise<unknown>;
  /** The first page's summary: the filtered count plus the scope's type maps. */
  summary: EntityTableSummary | null;
  tableData: EntitiesTableData | null;
  totalResultCount: number | null;
  /**
   * The page pins types none of which resolve to a version, so no query can
   * be built. Retrying cannot help — the state only clears when the pinned
   * types change.
   */
  unresolvablePins: boolean;
};

/**
 * The pages accumulated for one set of request filters. A response for
 * different filters resets the accumulation, so stale pages never mix into a
 * new sequence.
 *
 * Everything here belongs to its sequence and goes when the sequence does —
 * unlike the types the pages resolved, which {@link ResolvedTypes} keeps.
 */
type AccumulatedPages = {
  requestKey: string;
  tableData: EntitiesTableData | null;
  /** What the rows already folded in carry over, so a page costs a page. */
  aggregates: TableDataAggregates | null;
  summary: EntityTableSummary | null;
  nextCursor: string | null;
  /**
   * The continuation tokens already folded into {@link tableData}, so a
   * re-emitted response (e.g. Apollo's cache pass before the network pass)
   * does not append its page twice.
   */
  consumedCursors: Set<string>;
  /**
   * The continuation tokens this sequence handed out. A cursor from any other
   * sequence cannot continue this one.
   */
  issuedCursors: Set<string>;
  processingError?: Error;
};

/**
 * The types the pages resolved, keyed by type id and merged as pages arrive.
 *
 * Kept across sequences on purpose: a type's closed schema does not depend on
 * which rows asked for it, and dropping the pool mid-restart would leave
 * anything rendering a resolved type — a conversion's column title, say —
 * without one.
 */
type ResolvedTypes = {
  closedMultiEntityTypes: ClosedMultiEntityTypesRootMap;
  definitions: EntityTypeResolveDefinitions;
};

const mergeClosedMultiEntityTypeMaps = (
  target: ClosedMultiEntityTypesRootMap,
  source: ClosedMultiEntityTypesRootMap,
): ClosedMultiEntityTypesRootMap => {
  const merged: ClosedMultiEntityTypesRootMap = { ...target };

  for (const [key, sourceEntry] of Object.entries(source)) {
    const existing = merged[key];

    merged[key] = existing
      ? {
          schema: sourceEntry.schema,
          inner: mergeClosedMultiEntityTypeMaps(
            existing.inner ?? {},
            sourceEntry.inner ?? {},
          ),
        }
      : sourceEntry;
  }

  return merged;
};

const mergeDefinitions = (
  target: EntityTypeResolveDefinitions,
  source: EntityTypeResolveDefinitions,
): EntityTypeResolveDefinitions => ({
  dataTypes: { ...target.dataTypes, ...source.dataTypes },
  propertyTypes: { ...target.propertyTypes, ...source.propertyTypes },
  entityTypes: { ...target.entityTypes, ...source.entityTypes },
});

const asError = (thrown: unknown): Error =>
  thrown instanceof Error ? thrown : new Error(String(thrown));

/**
 * Reads a page of the entities table through the dedicated `queryEntitiesTable`
 * endpoint and accumulates pages into render-ready {@link EntitiesTableData}.
 *
 * Responses are processed in an effect rather than in Apollo's `onCompleted`,
 * whose exceptions are silently dropped in production builds — a response the
 * table cannot process surfaces through {@link EntitiesTableQueryData.error}.
 */
export const useEntitiesTableQuery = (params: {
  conversions?: ConversionRequest[];
  enabled: boolean;
  filterState: EntitiesFilterState;
  hideArchivedColumn?: boolean;
  hideColumns?: (keyof EntitiesTableRow)[];
  /** Whether the page pins types, making it wait for {@link params.resolvedPinnedEntityTypeIds}. */
  hasPinnedTypes: boolean;
  internalWebs: { webId: WebId }[];
  /** The page size — the endpoint requires one. */
  limit: number;
  /**
   * The pinned types resolved to versions — `null` while they still resolve.
   */
  resolvedPinnedEntityTypeIds: VersionedUrl[] | null;
  sort: EntityTableSorting;
}): EntitiesTableQueryData => {
  const {
    conversions,
    enabled,
    filterState,
    hideArchivedColumn,
    hideColumns,
    hasPinnedTypes,
    internalWebs,
    limit,
    resolvedPinnedEntityTypeIds,
    sort,
  } = params;

  const awaitingPinnedTypes =
    hasPinnedTypes && resolvedPinnedEntityTypeIds === null;

  /**
   * Pins that resolved to no version would query with an empty include list
   * and render an empty table as "this type has no entities" — misleading, so
   * it surfaces as an error instead.
   */
  const unresolvablePins =
    hasPinnedTypes && resolvedPinnedEntityTypeIds?.length === 0;

  const internalWebIds = useMemo(
    () => internalWebs.map(({ webId }) => webId),
    [internalWebs],
  );

  // The request minus the page, so a page can be requested against it and the
  // accumulated sequence recognised across renders.
  const baseRequest = useMemo(() => {
    if (!enabled || awaitingPinnedTypes || unresolvablePins) {
      return null;
    }

    const webs: EntityTableWebScope = filterState.web.includeOtherWebs
      ? {
          type: "exclude",
          webs: internalWebIds.filter(
            (webId) => !filterState.web.selectedInternalWebIds.has(webId),
          ),
        }
      : {
          type: "include",
          webs: internalWebIds.filter((webId) =>
            filterState.web.selectedInternalWebIds.has(webId),
          ),
        };

    const selectedTypeIds = filterState.type.selectedTypeIds;
    const entityTypeIds =
      resolvedPinnedEntityTypeIds ??
      (selectedTypeIds ? [...selectedTypeIds] : null);

    const propertyFilters = filterState.propertyFilters
      .map(buildEndpointPropertyFilter)
      .filter((propertyFilter) => propertyFilter !== null);

    return {
      conversions,
      filter: {
        webs,
        entityTypeIds,
        // The exclusions hold whatever the selection is, so picking a type
        // cannot bring the noisy system types back into the rows or pills.
        excludedTypeBaseUrls: [...noisySystemBaseUrls],
        includeArchived: filterState.includeArchived,
        propertyFilters:
          propertyFilters.length > 0 ? propertyFilters : undefined,
      },
      limit,
      sort,
      includeEntityTypes: "resolvedWithDataTypeChildren" as const,
    };
  }, [
    enabled,
    awaitingPinnedTypes,
    unresolvablePins,
    conversions,
    filterState.web,
    filterState.type.selectedTypeIds,
    filterState.includeArchived,
    filterState.propertyFilters,
    internalWebIds,
    limit,
    resolvedPinnedEntityTypeIds,
    sort,
  ]);

  /** Identifies the accumulated sequence — the request minus its page. */
  const requestKey = useMemo(
    () => (baseRequest ? JSON.stringify(baseRequest) : null),
    [baseRequest],
  );

  const [accumulated, setAccumulated] = useState<AccumulatedPages | null>(null);
  const [requestedCursor, setRequestedCursor] = useState<string | null>(null);

  // The pool is rendered from the state and merged against the ref: a page has
  // to merge against the pool as it stands, which reading the state inside the
  // effect that writes it would not give.
  const [resolvedTypes, setResolvedTypes] = useState<ResolvedTypes | null>(
    null,
  );
  const resolvedTypesRef = useRef<ResolvedTypes | null>(null);

  const cursor = cursorInEffect({
    requestedCursor,
    requestKey,
    sequence: accumulated,
  });

  const variables = useMemo<QueryEntitiesTableQueryVariables | null>(
    () =>
      baseRequest
        ? {
            request: {
              ...baseRequest,
              cursor: cursor ?? undefined,
              includeSummary: cursor === null,
            },
          }
        : null,
    [baseRequest, cursor],
  );

  const {
    data,
    error: queryError,
    loading,
    refetch,
  } = useQuery<QueryEntitiesTableQuery, QueryEntitiesTableQueryVariables>(
    queryEntitiesTableQuery,
    {
      fetchPolicy: "cache-and-network",
      skip: !variables,
      variables: variables ?? undefined,
    },
  );

  useEffect(() => {
    const response = data?.queryEntitiesTable;

    if (!response || !requestKey || !variables) {
      return;
    }

    const pageCursor = variables.request.cursor ?? null;

    const failed = (thrown: unknown) => {
      // The pages already shown stay intact, and the cursor is not marked
      // consumed so a retry processes the page again.
      setAccumulated((current) =>
        current
          ? { ...current, processingError: asError(thrown) }
          : {
              requestKey,
              tableData: null,
              aggregates: null,
              summary: null,
              nextCursor: null,
              consumedCursors: new Set(),
              issuedCursors: new Set(),
              processingError: asError(thrown),
            },
      );
    };

    if (!response.definitions) {
      failed(new Error("The response carries no type definitions"));
      return;
    }
    if (!response.closedMultiEntityTypes) {
      failed(new Error("The response carries no closed types"));
      return;
    }
    if (pageCursor === null && !response.summary) {
      // Every first page requests a summary. Without this guard a missing one
      // would leave the filter chips loading forever.
      failed(new Error("The response carries no summary"));
      return;
    }

    // The pool grows with every page and outlives the sequence, so it merges
    // against the latest one rather than against this render's.
    const previousTypes = resolvedTypesRef.current;
    const pool: ResolvedTypes = {
      closedMultiEntityTypes: previousTypes
        ? mergeClosedMultiEntityTypeMaps(
            previousTypes.closedMultiEntityTypes,
            response.closedMultiEntityTypes,
          )
        : response.closedMultiEntityTypes,
      definitions: previousTypes
        ? mergeDefinitions(previousTypes.definitions, response.definitions)
        : response.definitions,
    };
    resolvedTypesRef.current = pool;
    setResolvedTypes(pool);

    setAccumulated((current) => {
      const continues =
        pageCursor !== null && current?.requestKey === requestKey;

      if (continues && current.consumedCursors.has(pageCursor)) {
        return current;
      }

      try {
        // Only the page's own rows are turned into table rows — the pages
        // before it carry their result forward through the aggregates.
        const { tableData, aggregates } = generateTableDataFromEndpointRows({
          closedMultiEntityTypesRootMap: pool.closedMultiEntityTypes,
          definitions: pool.definitions,
          endpointRows: response.rows,
          previous: continues ? (current.aggregates ?? undefined) : undefined,
          hideColumns,
          hideArchivedColumn,
        });

        return {
          requestKey,
          tableData,
          aggregates,
          summary: response.summary ?? (continues ? current.summary : null),
          nextCursor: response.cursor ?? null,
          consumedCursors: continues
            ? new Set([...current.consumedCursors, pageCursor])
            : new Set(pageCursor === null ? [] : [pageCursor]),
          issuedCursors: new Set(
            [
              ...(continues ? current.issuedCursors : []),
              response.cursor ?? null,
            ].filter((issued): issued is string => issued !== null),
          ),
        };
      } catch (thrown) {
        return current
          ? { ...current, processingError: asError(thrown) }
          : {
              requestKey,
              tableData: null,
              aggregates: null,
              summary: null,
              nextCursor: null,
              consumedCursors: new Set(),
              issuedCursors: new Set(),
              processingError: asError(thrown),
            };
      }
    });
  }, [data, requestKey, variables, hideColumns, hideArchivedColumn]);

  // Processing errors are backend/frontend contract breaks that reproduce on
  // every retry — without the report they are invisible in production.
  const processingError = accumulated?.processingError;
  useEffect(() => {
    if (processingError) {
      Sentry.captureException(processingError);
    }
  }, [processingError]);

  const isCurrent =
    accumulated !== null &&
    requestKey !== null &&
    accumulated.requestKey === requestKey;

  const nextCursor = isCurrent ? accumulated.nextCursor : null;

  const loadMore = useCallback(() => {
    if (nextCursor !== null) {
      setRequestedCursor(nextCursor);
    }
  }, [nextCursor]);

  /**
   * Reads the sequence again from its first page.
   *
   * Refetching the page in flight would not do: its cursor pins the snapshot
   * the sequence started on, and the pages before it would keep their rows —
   * so anything written since (an archived entity, say) could not show up.
   */
  const restart = useCallback(async () => {
    setAccumulated(null);
    setRequestedCursor(null);

    // Dropping the cursor only re-runs the query when one was in effect. The
    // requested cursor can sit there without being in effect — a token the
    // current sequence never handed out — so the request in flight is already
    // the first page and only a network round trip is missing.
    if (cursor === null) {
      return refetch();
    }

    return undefined;
  }, [cursor, refetch]);

  return useMemo(
    () => ({
      canLoadMore: nextCursor !== null,
      closedMultiEntityTypes: resolvedTypes?.closedMultiEntityTypes ?? null,
      dataIsStale: accumulated !== null && !isCurrent,
      definitions: resolvedTypes?.definitions ?? null,
      error:
        queryError ??
        // A processing error belongs to the response it came from, so it stops
        // speaking for the table once a new request is in flight — where its
        // rows are still shown, but the failure that produced them is no
        // longer the one to retry.
        (isCurrent ? accumulated.processingError : undefined) ??
        (unresolvablePins
          ? new Error("The pinned type could not be resolved to any version")
          : undefined),
      loading: loading || (enabled && awaitingPinnedTypes),
      loadMore,
      restart,
      summary: accumulated?.summary ?? null,
      tableData: accumulated?.tableData ?? null,
      totalResultCount: accumulated?.summary?.count ?? null,
      unresolvablePins,
    }),
    [
      accumulated,
      resolvedTypes,
      isCurrent,
      nextCursor,
      queryError,
      unresolvablePins,
      loading,
      enabled,
      awaitingPinnedTypes,
      loadMore,
      restart,
    ],
  );
};
