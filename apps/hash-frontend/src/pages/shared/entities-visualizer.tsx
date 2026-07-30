import { Box, Stack, Typography, useTheme } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { atLeastOne, extractBaseUrl } from "@blockprotocol/type-system";
import { LoadingSpinner } from "@hashintel/design-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import {
  type EntityTableSummary,
  getClosedMultiEntityTypeFromMap,
  type HashEntity,
} from "@local/hash-graph-sdk/entity";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { useEntityTypesContextRequired } from "../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { HEADER_HEIGHT } from "../../shared/layout/layout-with-header/page-header";
import { tableContentSx } from "../../shared/table-content";
import { BulkActionsDropdown } from "../../shared/table-header/bulk-actions-dropdown";
import { Button } from "../../shared/ui";
import { useMemoCompare } from "../../shared/use-memo-compare";
import { useAuthenticatedUser } from "./auth-info-context";
import {
  EntitiesTable,
  toolbarHeight,
} from "./entities-visualizer/entities-table";
import { GridView } from "./entities-visualizer/grid-view";
import {
  FilterRibbon,
  QueryCount,
  VisualizerHeader,
  visualizerHeaderHeight,
} from "./entities-visualizer/header";
import { displaysFilesOnly } from "./entities-visualizer/shared/displays-files-only";
import { createDefaultFilterState } from "./entities-visualizer/shared/filter-state";
import {
  type SummarySource,
  useAvailableTypes,
} from "./entities-visualizer/shared/use-available-types";
import { useEntitiesTableQuery } from "./entities-visualizer/use-entities-table-query";
import { useEntitiesVisualizerData } from "./entities-visualizer/use-entities-visualizer-data";
import { EntityGraphVisualizer } from "./entity-graph-visualizer";
import { useSlideStack } from "./slide-stack";
import { TableHeaderToggle } from "./table-header-toggle";
import { TOP_CONTEXT_BAR_HEIGHT } from "./top-context-bar";
import { visualizerViewIcons } from "./visualizer-views";

import type { ColumnSort } from "../../components/grid/utils/sorting";
import type { ArchivableEntity } from "../../shared/is-archived";
import type {
  EntitiesTableRow,
  SortableEntitiesTableColumnKey,
} from "./entities-visualizer/entities-table-data";
import type { EntitiesFilterState } from "./entities-visualizer/shared/filter-state";
import type { EntityEditorProps } from "./entity/entity-editor";
import type { VisualizerView } from "./visualizer-views";
import type {
  BaseUrl,
  ClosedMultiEntityType,
  EntityId,
  PropertyObject,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import type { SizedGridColumn } from "@glideapps/glide-data-grid";
import type {
  EntityQueryCursor,
  EntityQuerySortingPath,
  EntityQuerySortingRecord,
  EntityQuerySortingToken,
  EntityTableSorting,
  NullOrdering,
  Ordering,
} from "@local/hash-graph-client";
import type { Dispatch, FunctionComponent, SetStateAction } from "react";

const tableSortKeyByColumnKey = {
  entityLabel: "label",
  lastEdited: "editionCreatedAtDecisionTime",
  created: "createdAtDecisionTime",
  entityTypes: "typeTitle",
  archived: "archived",
} as const satisfies Record<
  SortableEntitiesTableColumnKey,
  EntityTableSorting["key"]
>;

const generateGraphSort = (
  columnKey: SortableEntitiesTableColumnKey,
  direction: "asc" | "desc",
): EntityQuerySortingRecord => {
  const nulls: NullOrdering = direction === "asc" ? "last" : "first";
  const ordering: Ordering = direction === "asc" ? "ascending" : "descending";

  let path: EntityQuerySortingPath;

  switch (columnKey) {
    case "entityLabel":
      path = ["label" satisfies EntityQuerySortingToken];
      break;
    case "lastEdited":
      path = [
        "editionCreatedAtTransactionTime" satisfies EntityQuerySortingToken,
      ];
      break;
    case "created":
      path = ["createdAtTransactionTime" satisfies EntityQuerySortingToken];
      break;
    case "entityTypes":
      path = ["typeTitle" satisfies EntityQuerySortingToken];
      break;
    case "archived":
      path = ["archived" satisfies EntityQuerySortingToken];
      break;
    default:
      throw new Error(
        `Unexpected sorting column key: ${columnKey satisfies never}`,
      );
  }

  return {
    path,
    nulls,
    ordering,
  };
};

export const EntitiesVisualizer: FunctionComponent<{
  /**
   * Limit the entities displayed to only those matching any version of this type
   */
  entityTypeBaseUrl?: BaseUrl;
  /**
   * Limit the entities displayed to only those matching this exact type version
   */
  entityTypeId?: VersionedUrl;
  /**
   * Hide specific columns from the table
   */
  hideColumns?: (keyof EntitiesTableRow)[];
}> = ({ entityTypeBaseUrl, entityTypeId, hideColumns }) => {
  const theme = useTheme();

  const { authenticatedUser } = useAuthenticatedUser();

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const internalWebs = useMemoCompare(
    () => {
      return [
        {
          webId: authenticatedUser.accountId as WebId,
          name: `@${authenticatedUser.shortname}`,
        },
        ...authenticatedUser.memberOf.map(({ org }) => ({
          webId: org.webId,
          name: `@${org.shortname}`,
        })),
      ];
    },
    [authenticatedUser],
    (oldValue, newValue) => {
      return (
        oldValue.length === newValue.length &&
        oldValue.every((oldWeb) =>
          newValue.some(
            (newWeb) =>
              oldWeb.webId === newWeb.webId && oldWeb.name === newWeb.name,
          ),
        )
      );
    },
  );

  const [filterState, _setFilterState] = useState<EntitiesFilterState>(() =>
    createDefaultFilterState(internalWebs.map(({ webId }) => webId)),
  );

  // The table query owns its own cursor: it drops it when the request changes,
  // so only the subgraph path needs one here.
  const [subgraphCursor, setSubgraphCursor] = useState<EntityQueryCursor>();

  const resetCursors = useCallback(() => {
    setSubgraphCursor(undefined);
  }, []);
  const [activeConversionsWithoutTitle, _setActiveConversions] = useState<{
    [columnBaseUrl: BaseUrl]: VersionedUrl;
  } | null>(null);

  const setActiveConversions = useCallback<
    Dispatch<
      SetStateAction<{
        [columnBaseUrl: BaseUrl]: VersionedUrl;
      } | null>
    >
  >(
    (newConversionsOrUpdater) => {
      _setActiveConversions(newConversionsOrUpdater);
      resetCursors();
    },
    [resetCursors],
  );

  const setFilterState = useCallback(
    (
      newFilterStateOrUpdater:
        | EntitiesFilterState
        | ((prev: EntitiesFilterState) => EntitiesFilterState),
    ) => {
      _setFilterState((prev) =>
        typeof newFilterStateOrUpdater === "function"
          ? newFilterStateOrUpdater(prev)
          : newFilterStateOrUpdater,
      );
      resetCursors();
    },
    [resetCursors],
  );

  const [view, _setView] = useState<VisualizerView>("Table");

  const setView = useCallback(
    (newView: VisualizerView) => {
      _setView(newView);
      resetCursors();
    },
    [resetCursors],
  );

  const [sort, _setSort] = useState<ColumnSort<SortableEntitiesTableColumnKey>>(
    {
      columnKey: "entityLabel",
      direction: "asc",
    },
  );

  const setSort = useCallback(
    (newSort: ColumnSort<SortableEntitiesTableColumnKey>) => {
      _setSort(newSort);
      resetCursors();
    },
    [resetCursors],
  );

  const graphSort = useMemo(
    () => generateGraphSort(sort.columnKey, sort.direction),
    [sort],
  );

  const tableSort = useMemo<EntityTableSorting>(
    () => ({
      key: tableSortKeyByColumnKey[sort.columnKey],
      ordering: sort.direction === "asc" ? "ascending" : "descending",
    }),
    [sort],
  );

  const isTypePinned = !!entityTypeBaseUrl || !!entityTypeId;

  const usesTableEndpoint = view === "Table";

  /**
   * The table endpoint's first page carries the type summary. Mirroring it
   * into state lets `useAvailableTypes` (called before the table query, which
   * needs its resolved pins) derive the filter chips from it without a fetch
   * of its own.
   */
  const [tableSummary, setTableSummary] = useState<EntityTableSummary | null>(
    null,
  );
  const [tableSummaryError, setTableSummaryError] = useState<Error>();

  /**
   * The table's summary keeps serving the other views once it has arrived: it
   * describes the scope rather than the view, so refetching it on a view change
   * would gate Grid and Graph behind a round trip the page has already paid
   * for. Only a view change that happens before any summary arrived falls back
   * to fetching one, since no other read produces it.
   */
  const summarySource = useMemo<SummarySource>(
    () =>
      !isTypePinned && (usesTableEndpoint || tableSummary !== null)
        ? { mode: "external", summary: tableSummary, error: tableSummaryError }
        : { mode: "fetch" },
    [usesTableEndpoint, isTypePinned, tableSummary, tableSummaryError],
  );

  const {
    availableEntityTypes,
    pinnedEntityTypeIds,
    propertyFilterData,
    loading: availableTypesLoading,
    typeUniverse,
    typeUniverseError,
    refetchTypeUniverse,
  } = useAvailableTypes({
    filterState,
    internalWebs,
    entityTypeBaseUrl,
    entityTypeIds: entityTypeId ? [entityTypeId] : undefined,
    summarySource,
  });

  const conversions = useMemo(
    () =>
      activeConversionsWithoutTitle
        ? typedEntries(activeConversionsWithoutTitle).map(
            ([columnBaseUrl, dataTypeId]) => ({
              path: [columnBaseUrl],
              dataTypeId,
            }),
          )
        : undefined,
    [activeConversionsWithoutTitle],
  );

  const tableQuery = useEntitiesTableQuery({
    conversions,
    enabled: usesTableEndpoint,
    filterState,
    hideArchivedColumn: !filterState.includeArchived,
    hideColumns,
    hasPinnedTypes: isTypePinned,
    internalWebs,
    limit: 500,
    resolvedPinnedEntityTypeIds: pinnedEntityTypeIds,
    sort: tableSort,
  });

  const entitiesData = useEntitiesVisualizerData({
    conversions,
    cursor: subgraphCursor,
    entityTypeBaseUrl,
    entityTypeIds: entityTypeId ? [entityTypeId] : undefined,
    filterState,
    internalWebs,
    limit: 500,
    sort: graphSort,
    typeUniverse,
    typeUniverseError,
    view,
  });

  useEffect(() => {
    setTableSummary(tableQuery.summary);
  }, [tableQuery.summary]);

  useEffect(() => {
    setTableSummaryError(tableQuery.error);
  }, [tableQuery.error]);

  const [dataLoading, setDataLoading] = useState(entitiesData.loading);
  const [visualizerData, setVisualizerData] = useState(entitiesData);

  const {
    cursor: nextCursor,
    definitions,
    entities,
    closedMultiEntityTypes: closedMultiEntityTypesRootMap,
    subgraph,
  } = visualizerData;

  /**
   * The types of the entities on display, taken from whichever read has rows
   * that still answer the current request.
   *
   * Deliberately not keyed on the active view. {@link displaysFilesOnly} reads
   * this and the effect below switches the view on that answer, so a
   * view-dependent source would feed the effect its own output: a page of files
   * would switch to Grid, whose read has no rows yet, which switches back.
   *
   * The table read keeps its rows while it is disabled, so they are only used
   * while they belong to the current request — otherwise a filter change made
   * outside the Table view would keep answering from the rows it replaced.
   *
   * The row type lists and the map they are looked up in always come from the
   * same read.
   */
  const closedMultiEntityTypes = useMemo(() => {
    const { typesRootMap, rowTypeIdLists } =
      tableQuery.tableData && !tableQuery.dataIsStale
        ? {
            typesRootMap: tableQuery.closedMultiEntityTypes,
            rowTypeIdLists: tableQuery.tableData.rows.map((row) =>
              row.entityTypes.map(
                (rowEntityType) => rowEntityType.entityTypeId,
              ),
            ),
          }
        : {
            typesRootMap: closedMultiEntityTypesRootMap,
            rowTypeIdLists:
              entities?.map((entity) => entity.metadata.entityTypeIds) ?? [],
          };

    if (!typesRootMap) {
      return [];
    }

    const relevantEntityTypesMap = new Map<string, ClosedMultiEntityType>();

    for (const rowTypeIds of rowTypeIdLists) {
      // The endpoint's rows carry a plain list, so an entity without types is
      // representable and has nothing to look up.
      const entityTypeIds = atLeastOne(rowTypeIds);

      if (!entityTypeIds) {
        continue;
      }

      const key = entityTypeIds.toSorted().join(",");

      if (!relevantEntityTypesMap.has(key)) {
        relevantEntityTypesMap.set(
          key,
          getClosedMultiEntityTypeFromMap(typesRootMap, entityTypeIds),
        );
      }
    }

    return Array.from(relevantEntityTypesMap.values());
  }, [
    tableQuery.closedMultiEntityTypes,
    tableQuery.tableData,
    tableQuery.dataIsStale,
    entities,
    closedMultiEntityTypesRootMap,
  ]);

  const activeConversions = useMemo(() => {
    const activeDefinitions = usesTableEndpoint
      ? tableQuery.definitions
      : definitions;

    // The definitions arrive with the rows, so a sequence reading its first
    // page again — after a retry or a bulk action — has none to resolve the
    // conversions' titles against yet. The conversions themselves ride in the
    // request regardless; only their column headers wait.
    if (!activeConversionsWithoutTitle || !activeDefinitions) {
      return null;
    }

    return Object.fromEntries(
      typedEntries(activeConversionsWithoutTitle).map(
        ([columnBaseUrl, dataTypeId]) => {
          const dataType = activeDefinitions.dataTypes[dataTypeId];

          if (!dataType) {
            throw new Error(
              `No data type found for column base URL: ${columnBaseUrl}`,
            );
          }

          return [
            columnBaseUrl,
            {
              dataTypeId,
              title: dataType.schema.title,
            },
          ];
        },
      ),
    );
  }, [
    activeConversionsWithoutTitle,
    usesTableEndpoint,
    tableQuery.definitions,
    definitions,
  ]);

  /**
   * The subgraph hook clears its data when a new request starts. Holding the
   * last loaded state here keeps the Grid and Graph views' previous results on
   * screen while the next ones load. The Table view does not need this — its
   * query hook accumulates pages itself.
   */
  useEffect(() => {
    setDataLoading(entitiesData.loading);

    // A standing-by query reports no data and no loading, which would overwrite
    // the held state with an empty result and cold-start the view it was held
    // for.
    if (!entitiesData.loading && !entitiesData.skipped) {
      setVisualizerData(entitiesData);
    }
  }, [entitiesData]);

  useEffect(() => {
    // An errored summary yields EMPTY available types — that is ignorance, not
    // knowledge that the selected types are gone. Pruning against it would wipe
    // the selection whose explicit type clause keeps the page working.
    if (availableTypesLoading || typeUniverseError) {
      return;
    }

    let nextSelectedTypeIds = filterState.type.selectedTypeIds;

    if (!isTypePinned && filterState.type.selectedTypeIds) {
      const availableEntityTypeIds = new Set(
        availableEntityTypes.map(
          ({ entityTypeId: availableEntityTypeId }) => availableEntityTypeId,
        ),
      );

      const retainedSelectedTypeIds = [
        ...filterState.type.selectedTypeIds,
      ].filter((selectedTypeId) => availableEntityTypeIds.has(selectedTypeId));

      if (
        retainedSelectedTypeIds.length !== filterState.type.selectedTypeIds.size
      ) {
        nextSelectedTypeIds =
          retainedSelectedTypeIds.length === 0
            ? null
            : new Set(retainedSelectedTypeIds);
      }
    }

    let nextPropertyFilters = filterState.propertyFilters;
    if (filterState.propertyFilters.length) {
      const filterablePropertyKindsByBaseUrl = new Map(
        propertyFilterData
          .filter((property) => property.filterable)
          .map((property) => [property.baseUrl, property.kind]),
      );

      nextPropertyFilters = filterState.propertyFilters.filter(
        ({ baseUrl, kind }) =>
          filterablePropertyKindsByBaseUrl.get(baseUrl) === kind,
      );
    }

    const typeFilterChanged =
      nextSelectedTypeIds !== filterState.type.selectedTypeIds;
    const propertyFiltersChanged =
      nextPropertyFilters.length !== filterState.propertyFilters.length;

    if (!typeFilterChanged && !propertyFiltersChanged) {
      return;
    }

    setFilterState((prev) => ({
      ...prev,
      type: typeFilterChanged
        ? { selectedTypeIds: nextSelectedTypeIds }
        : prev.type,
      propertyFilters: propertyFiltersChanged
        ? nextPropertyFilters
        : prev.propertyFilters,
    }));
  }, [
    availableEntityTypes,
    availableTypesLoading,
    filterState.propertyFilters,
    filterState.type.selectedTypeIds,
    isTypePinned,
    propertyFilterData,
    setFilterState,
    typeUniverseError,
  ]);

  const isDisplayingFilesOnly = useMemo(
    () =>
      displaysFilesOnly({
        closedMultiEntityTypes,
        entityTypeBaseUrl,
        entityTypeId,
        isSpecialEntityTypeLookup,
      }),
    [
      entityTypeBaseUrl,
      entityTypeId,
      closedMultiEntityTypes,
      isSpecialEntityTypeLookup,
    ],
  );

  const supportGridView = isDisplayingFilesOnly;

  useEffect(() => {
    if (isDisplayingFilesOnly) {
      setView("Grid");
    } else {
      setView("Table");
    }
  }, [isDisplayingFilesOnly, setView]);

  const isViewingOnlyPages =
    entityTypeBaseUrl === systemEntityTypes.page.entityTypeBaseUrl ||
    entityTypeId === systemEntityTypes.page.entityTypeId;

  const { pushToSlideStack } = useSlideStack();

  const handleEntityClick = useCallback(
    (
      entityId: EntityId,
      options?: Pick<EntityEditorProps, "defaultOutgoingLinkFilters">,
    ) => {
      pushToSlideStack({
        kind: "entity",
        itemId: entityId,
        defaultOutgoingLinkFilters: options?.defaultOutgoingLinkFilters,
      });
    },
    [pushToSlideStack],
  );

  const handleEntityTypeClick = useCallback(
    ({ entityTypeId: itemId }: { entityTypeId: VersionedUrl }) => {
      pushToSlideStack({ kind: "entityType", itemId });
    },
    [pushToSlideStack],
  );

  const currentlyDisplayedColumnsRef = useRef<SizedGridColumn[] | null>(null);
  const currentlyDisplayedRowsRef = useRef<EntitiesTableRow[] | null>(null);

  const contentTopRef = useRef<HTMLDivElement>(null);
  const [contentTop, setContentTop] = useState<number | null>(null);

  useEffect(() => {
    const el = contentTopRef.current;
    if (!el) {
      return;
    }

    const measure = () => {
      setContentTop(el.getBoundingClientRect().top);
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, []);

  const availableHeight = `calc(100vh - ${
    contentTop != null
      ? `${contentTop}px - ${theme.spacing(5)}`
      : `(${
          HEADER_HEIGHT + TOP_CONTEXT_BAR_HEIGHT + 230 + visualizerHeaderHeight
        }px + ${theme.spacing(5)} + ${theme.spacing(5)}`
  })`;

  const tableHeight = `min(${availableHeight}, 1000px)`;

  const isPrimaryEntity = useCallback(
    (entity: { metadata: Pick<HashEntity["metadata"], "entityTypeIds"> }) =>
      entityTypeBaseUrl
        ? entity.metadata.entityTypeIds.some(
            (typeId) => extractBaseUrl(typeId) === entityTypeBaseUrl,
          )
        : entityTypeId
          ? entity.metadata.entityTypeIds.includes(entityTypeId)
          : false,
    [entityTypeId, entityTypeBaseUrl],
  );

  const [showTableSearch, setShowTableSearch] = useState(false);

  const [selectedTableRows, setSelectedTableRows] = useState<
    EntitiesTableRow[]
  >([]);

  const nextPage = useCallback(() => {
    if (usesTableEndpoint) {
      tableQuery.loadMore();
    } else {
      setSubgraphCursor(nextCursor ?? undefined);
    }
  }, [usesTableEndpoint, tableQuery, nextCursor]);

  const selectedEntities = useMemo<ArchivableEntity[]>(() => {
    if (view !== "Table") {
      return [];
    }

    return selectedTableRows.map((row) => ({
      metadata: {
        recordId: { entityId: row.entityId },
        entityTypeIds: row.entityTypes.map(
          (rowEntityType) => rowEntityType.entityTypeId,
        ),
        archived: row.archived,
      },
      properties: Object.fromEntries(
        row.applicableProperties.map((baseUrl) => [
          baseUrl,
          row[baseUrl]?.value,
        ]),
      ) as PropertyObject,
    }));
  }, [selectedTableRows, view]);

  const handleBulkActionCompleted = useCallback(() => {
    // A rejected read needs no handling here — the failure comes back through
    // the hook's error state.
    if (usesTableEndpoint) {
      tableQuery.restart().catch(() => {});
    } else {
      entitiesData.refetch().catch(() => {});
    }
    setSelectedTableRows([]);
  }, [usesTableEndpoint, tableQuery, entitiesData]);

  // The universe only feeds the default view — with a pinned type or an
  // explicit selection the main query runs on its own type clause, so a failed
  // summary must not blank results that still load.
  const typeUniverseBlocksResults =
    !!typeUniverseError &&
    !isTypePinned &&
    filterState.type.selectedTypeIds === null;

  const activeError = usesTableEndpoint
    ? tableQuery.error
    : visualizerData.error;

  // A failed page query with nothing to show gets the error state. With data
  // on screen the stale results stay visible alongside a retry banner instead.
  const queryBlocksResults =
    !!activeError && (usesTableEndpoint ? !tableQuery.tableData : !subgraph);

  const blockingError = typeUniverseBlocksResults
    ? typeUniverseError
    : activeError;

  // Unresolvable pins only clear when the pinned types change, so offering a
  // retry would be a dead button.
  const errorIsRetryable = !(usesTableEndpoint && tableQuery.unresolvablePins);

  const showLoading = usesTableEndpoint
    ? !tableQuery.tableData
    : !subgraph || !closedMultiEntityTypesRootMap;

  const resultsLoading = usesTableEndpoint ? tableQuery.loading : dataLoading;

  const totalResultCount = usesTableEndpoint
    ? tableQuery.totalResultCount
    : visualizerData.totalResultCount;

  return (
    <Box>
      <VisualizerHeader
        left={
          selectedEntities.length > 0 ? (
            <BulkActionsDropdown
              selectedItems={selectedEntities}
              onBulkActionCompleted={handleBulkActionCompleted}
            />
          ) : (
            <FilterRibbon
              availableEntityTypes={availableEntityTypes}
              availableTypesLoading={availableTypesLoading}
              propertyFilterMetadata={propertyFilterData}
              filterState={filterState}
              internalWebs={internalWebs}
              isTypePinned={isTypePinned}
              setFilterState={(updater) => setFilterState(updater)}
            />
          )
        }
        right={
          <>
            <QueryCount count={totalResultCount} loading={resultsLoading} />
            <TableHeaderToggle
              value={view}
              setValue={setView}
              options={(
                [
                  "Table",
                  ...(supportGridView ? (["Grid"] as const) : []),
                  "Graph",
                ] as const satisfies VisualizerView[]
              ).map((optionValue) => ({
                icon: visualizerViewIcons[optionValue],
                label: `${optionValue} view`,
                value: optionValue,
              }))}
            />
          </>
        }
      />
      <Box ref={contentTopRef} />
      {typeUniverseBlocksResults || queryBlocksResults ? (
        <Stack
          gap={2}
          sx={[
            {
              alignItems: "center",
              justifyContent: "center",
              height: tableHeight,
              width: "100%",
            },
            tableContentSx,
          ]}
        >
          <Typography>Something went wrong loading entities.</Typography>
          {blockingError ? (
            <Typography
              variant="smallTextParagraphs"
              sx={{ color: ({ palette }) => palette.gray[70] }}
            >
              {blockingError.message}
            </Typography>
          ) : null}
          {errorIsRetryable ? (
            <Button
              onClick={() => {
                // A rejected read needs no handling here — the failure comes
                // back through the hook's error state. The table path is
                // checked first: its own query is what failed, and the type
                // universe it reports comes from that same failure.
                if (usesTableEndpoint) {
                  tableQuery.restart().catch(() => {});
                } else if (typeUniverseBlocksResults) {
                  refetchTypeUniverse().catch(() => {});
                } else {
                  entitiesData.refetch().catch(() => {});
                }
              }}
              size="small"
            >
              Try again
            </Button>
          ) : null}
        </Stack>
      ) : showLoading ? (
        <Stack
          sx={[
            {
              alignItems: "center",
              justifyContent: "center",
              height: tableHeight,
              width: "100%",
            },
            tableContentSx,
          ]}
        >
          <Box>
            <LoadingSpinner size={42} color={theme.palette.blue[60]} />
          </Box>
        </Stack>
      ) : view === "Graph" ? (
        <Box height={availableHeight} sx={tableContentSx}>
          <EntityGraphVisualizer
            closedMultiEntityTypesRootMap={closedMultiEntityTypesRootMap}
            entities={entities}
            loadingComponent={
              <LoadingSpinner size={42} color={theme.palette.blue[60]} />
            }
            isPrimaryEntity={isPrimaryEntity}
            onEntityClick={handleEntityClick}
          />
        </Box>
      ) : view === "Grid" ? (
        <GridView entities={entities} onEntityClick={handleEntityClick} />
      ) : (
        <>
          {activeError ? (
            <Stack
              direction="row"
              gap={1.5}
              sx={{ alignItems: "center", mb: 1 }}
            >
              <Typography variant="smallTextParagraphs">
                {tableQuery.dataIsStale
                  ? "Something went wrong refreshing entities — showing the previous results."
                  : "Something went wrong loading more entities."}
              </Typography>
              {errorIsRetryable ? (
                <Button
                  onClick={() => {
                    // A rejected read needs no handling here — the failure
                    // comes back through the hook's error state.
                    tableQuery.restart().catch(() => {});
                  }}
                  size="xs"
                >
                  Try again
                </Button>
              ) : null}
            </Stack>
          ) : null}
          <EntitiesTable
            activeConversions={activeConversions}
            csvFileTitle="Entities"
            currentlyDisplayedColumnsRef={currentlyDisplayedColumnsRef}
            currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
            handleEntityClick={handleEntityClick}
            hasMoreRowsAvailable={tableQuery.canLoadMore}
            loading={resultsLoading}
            isViewingOnlyPages={isViewingOnlyPages}
            maxHeight={`calc(${tableHeight} - ${toolbarHeight}px)`}
            loadMoreRows={tableQuery.canLoadMore ? nextPage : undefined}
            setActiveConversions={setActiveConversions}
            setSelectedEntityType={handleEntityTypeClick}
            setSelectedRows={setSelectedTableRows}
            selectedRows={selectedTableRows}
            showSearch={showTableSearch}
            setShowSearch={setShowTableSearch}
            sort={sort}
            setSort={setSort}
            tableData={tableQuery.tableData}
            totalResultCount={totalResultCount}
          />
        </>
      )}
    </Box>
  );
};
