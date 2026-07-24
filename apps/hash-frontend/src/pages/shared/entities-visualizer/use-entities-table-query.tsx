import { useQuery } from "@apollo/client";
import * as Sentry from "@sentry/nextjs";
import { useEffect, useMemo, useState } from "react";

import { noisySystemBaseUrls } from "@local/hash-isomorphic-utils/graph-queries";

import { queryEntitiesTableQuery } from "../../../graphql/queries/knowledge/entity.queries";
import { apolloClient } from "../../../lib/apollo-client";
import { buildEndpointPropertyFilter } from "./shared/property-filters/build-property-filter-clause";
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
import type { VersionedUrl, WebId } from "@blockprotocol/type-system";
import type { EntityTableSorting } from "@local/hash-graph-client";
import type {
  ConversionRequest,
  EntityTableRow,
  EntityTableSummary,
  EntityTableTypeScope,
  EntityTableWebScope,
} from "@local/hash-graph-sdk/entity";
import type {
  ClosedMultiEntityTypesRootMap,
  EntityTypeResolveDefinitions,
} from "@local/hash-graph-sdk/ontology";

export type EntitiesTableQueryData = {
  /** The closed types of every accumulated page, deep-merged. */
  closedMultiEntityTypes: ClosedMultiEntityTypesRootMap | null;
  /** Continuation for the next page, or `null` when there is none (yet). */
  cursor: string | null;
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
  hadCachedContent: boolean;
  loading: boolean;
  refetch: () => Promise<unknown>;
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
 */
type AccumulatedPages = {
  requestKey: string;
  rows: EntityTableRow[];
  closedMultiEntityTypes: ClosedMultiEntityTypesRootMap;
  definitions: EntityTypeResolveDefinitions;
  tableData: EntitiesTableData | null;
  summary: EntityTableSummary | null;
  nextCursor: string | null;
  /**
   * The continuation tokens already folded into {@link rows}, so a re-emitted
   * response (e.g. Apollo's cache pass before the network pass) does not
   * append its page twice.
   */
  consumedCursors: Set<string>;
  processingError?: Error;
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
  /** Continuation token of the page to fetch, from a previous response. */
  cursor?: string;
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
    cursor,
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

  const variables = useMemo<QueryEntitiesTableQueryVariables | null>(() => {
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
    const includedTypeIds =
      resolvedPinnedEntityTypeIds ??
      (selectedTypeIds ? [...selectedTypeIds] : null);

    const types: EntityTableTypeScope = includedTypeIds
      ? { type: "include", entityTypeIds: includedTypeIds }
      : {
          type: "exclude",
          entityTypeBaseUrls: [...noisySystemBaseUrls],
        };

    const propertyFilters = filterState.propertyFilters
      .map(buildEndpointPropertyFilter)
      .filter((propertyFilter) => propertyFilter !== null);

    return {
      request: {
        conversions,
        filter: {
          webs,
          types,
          includeArchived: filterState.includeArchived,
          includeDrafts: false,
          propertyFilters:
            propertyFilters.length > 0 ? propertyFilters : undefined,
        },
        cursor: cursor ?? undefined,
        limit,
        sort,
        includeSummary: !cursor,
        includeEntityTypes: "resolvedWithDataTypeChildren",
      },
    };
  }, [
    enabled,
    awaitingPinnedTypes,
    unresolvablePins,
    conversions,
    cursor,
    filterState.web,
    filterState.type.selectedTypeIds,
    filterState.includeArchived,
    filterState.propertyFilters,
    internalWebIds,
    limit,
    resolvedPinnedEntityTypeIds,
    sort,
  ]);

  /** Everything except the cursor identifies the accumulation sequence. */
  const requestKey = useMemo(() => {
    if (!variables) {
      return null;
    }

    const {
      cursor: _cursor,
      includeSummary: _includeSummary,
      ...rest
    } = variables.request;

    return JSON.stringify(rest);
  }, [variables]);

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

  const [accumulated, setAccumulated] = useState<AccumulatedPages | null>(null);

  useEffect(() => {
    const response = data?.queryEntitiesTable;

    if (!response || !requestKey || !variables) {
      return;
    }

    const pageCursor = variables.request.cursor ?? null;

    setAccumulated((current) => {
      const continues =
        pageCursor !== null && current?.requestKey === requestKey;

      if (continues && current.consumedCursors.has(pageCursor)) {
        return current;
      }

      try {
        if (!response.definitions) {
          throw new Error("The response carries no type definitions");
        }
        if (!response.closedMultiEntityTypes) {
          throw new Error("The response carries no closed types");
        }
        if (pageCursor === null && !response.summary) {
          // Every first page requests a summary. Without this guard a missing
          // one would leave the filter chips loading forever.
          throw new Error("The response carries no summary");
        }

        const rows = continues
          ? [...current.rows, ...response.rows]
          : [...response.rows];
        const closedMultiEntityTypes = continues
          ? mergeClosedMultiEntityTypeMaps(
              current.closedMultiEntityTypes,
              response.closedMultiEntityTypes,
            )
          : response.closedMultiEntityTypes;
        const definitions = continues
          ? mergeDefinitions(current.definitions, response.definitions)
          : response.definitions;

        return {
          requestKey,
          rows,
          closedMultiEntityTypes,
          definitions,
          tableData: generateTableDataFromEndpointRows({
            closedMultiEntityTypesRootMap: closedMultiEntityTypes,
            definitions,
            endpointRows: rows,
            hideColumns,
            hideArchivedColumn,
          }),
          summary: response.summary ?? (continues ? current.summary : null),
          nextCursor: response.cursor ?? null,
          consumedCursors: continues
            ? new Set([...current.consumedCursors, pageCursor])
            : new Set(pageCursor === null ? [] : [pageCursor]),
        };
      } catch (thrown) {
        // The pages already shown stay intact, and the cursor is not marked
        // consumed so a retry processes the page again.
        return current
          ? { ...current, processingError: asError(thrown) }
          : {
              requestKey,
              rows: [],
              closedMultiEntityTypes: {},
              definitions: {
                dataTypes: {},
                propertyTypes: {},
                entityTypes: {},
              },
              tableData: null,
              summary: null,
              nextCursor: null,
              consumedCursors: new Set(),
              processingError: asError(thrown),
            };
      }
    });
  }, [data, requestKey, variables, hideColumns, hideArchivedColumn]);

  const hadCachedContent = useMemo(
    () =>
      !!variables &&
      !!apolloClient.readQuery({
        query: queryEntitiesTableQuery,
        variables,
      }),
    [variables],
  );

  // Processing errors are backend/frontend contract breaks that reproduce on
  // every retry — without the report they are invisible in production.
  const processingError = accumulated?.processingError;
  useEffect(() => {
    if (processingError) {
      Sentry.captureException(processingError);
    }
  }, [processingError]);

  return useMemo(() => {
    // Stale accumulation (from previous filters) keeps the old rows on screen
    // while the new first page loads, but must not offer its continuation.
    const isCurrent =
      accumulated !== null &&
      requestKey !== null &&
      accumulated.requestKey === requestKey;

    const error =
      queryError ??
      accumulated?.processingError ??
      (unresolvablePins
        ? new Error("The pinned type could not be resolved to any version")
        : undefined);

    return {
      closedMultiEntityTypes: accumulated?.closedMultiEntityTypes ?? null,
      cursor: isCurrent ? accumulated.nextCursor : null,
      dataIsStale: accumulated !== null && !isCurrent,
      definitions: accumulated?.definitions ?? null,
      error,
      hadCachedContent,
      loading: loading || (enabled && awaitingPinnedTypes),
      refetch,
      summary: accumulated?.summary ?? null,
      tableData: accumulated?.tableData ?? null,
      totalResultCount: accumulated?.summary?.count ?? null,
      unresolvablePins,
    };
  }, [
    accumulated,
    requestKey,
    queryError,
    unresolvablePins,
    hadCachedContent,
    loading,
    enabled,
    awaitingPinnedTypes,
    refetch,
  ]);
};
