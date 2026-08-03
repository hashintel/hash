import { Box, Stack, useTheme } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isBaseUrl } from "@blockprotocol/type-system";
import { LoadingSpinner } from "@hashintel/design-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import { getClosedMultiEntityTypeFromMap } from "@local/hash-graph-sdk/entity";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { useEntityTypesContextRequired } from "../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { HEADER_HEIGHT } from "../../shared/layout/layout-with-header/page-header";
import { tableContentSx } from "../../shared/table-content";
import { BulkActionsDropdown } from "../../shared/table-header/bulk-actions-dropdown";
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
import { NetworkGraphView } from "./entities-visualizer/network-graph-view";
import { buildEntitiesFilter } from "./entities-visualizer/shared/build-filter";
import { createDefaultFilterState } from "./entities-visualizer/shared/filter-state";
import { useAvailableTypes } from "./entities-visualizer/shared/use-available-types";
import { useEntitiesVisualizerData } from "./entities-visualizer/use-entities-visualizer-data";
import { useSlideStack } from "./slide-stack";
import { TableHeaderToggle } from "./table-header-toggle";
import { TOP_CONTEXT_BAR_HEIGHT } from "./top-context-bar";
import { visualizerViewIcons, visualizerViewLabels } from "./visualizer-views";

import type { ColumnSort } from "../../components/grid/utils/sorting";
import type {
  EntitiesTableRow,
  SortableEntitiesTableColumnKey,
} from "./entities-visualizer/entities-table-data";
import type { EntitiesFilterState } from "./entities-visualizer/shared/filter-state";
import type { TypeColorOverrides } from "./entities-visualizer/shared/type-colors";
import type { EntityEditorProps } from "./entity/entity-editor";
import type { VisualizerView } from "./visualizer-views";
import type {
  BaseUrl,
  ClosedMultiEntityType,
  EntityId,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import type { SizedGridColumn } from "@glideapps/glide-data-grid";
import type {
  EntityQueryCursor,
  EntityQuerySortingPath,
  EntityQuerySortingRecord,
  EntityQuerySortingToken,
  NullOrdering,
  Ordering,
} from "@local/hash-graph-client";
import type { Dispatch, FunctionComponent, SetStateAction } from "react";

// Stable empty sets so a non-graph view passes the same "nothing hidden"
// references every render.
const EMPTY_TYPE_ID_SET: ReadonlySet<VersionedUrl> = new Set();
const EMPTY_BASE_URL_SET: ReadonlySet<BaseUrl> = new Set();

/**
 * @todo: avoid having to maintain this list, potentially by
 * adding an `isFile` boolean to the generated ontology IDs file.
 */
const allFileEntityTypeOntologyIds = [
  systemEntityTypes.file,
  systemEntityTypes.imageFile,
  systemEntityTypes.documentFile,
  systemEntityTypes.docxDocument,
  systemEntityTypes.pdfDocument,
  systemEntityTypes.presentationFile,
  systemEntityTypes.pptxPresentation,
];

const allFileEntityTypeIds = allFileEntityTypeOntologyIds.map(
  ({ entityTypeId }) => entityTypeId,
) as VersionedUrl[];

const allFileEntityTypeBaseUrl = allFileEntityTypeOntologyIds.map(
  ({ entityTypeBaseUrl }) => entityTypeBaseUrl,
);

const generateGraphSort = (
  columnKey: SortableEntitiesTableColumnKey,
  direction: "asc" | "desc",
  convertTo?: BaseUrl,
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
    default: {
      if (!isBaseUrl(columnKey)) {
        throw new Error(`Unexpected sorting column key: ${columnKey}`);
      }
      path = ["properties" satisfies EntityQuerySortingToken, columnKey];

      if (convertTo) {
        path.push("convert", convertTo);
      }
    }
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

  const [cursor, setCursor] = useState<EntityQueryCursor>();
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
      setCursor(undefined);
    },
    [setCursor],
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
      setCursor(undefined);
    },
    [setCursor],
  );

  const [typeColorOverrides, setTypeColorOverrides] =
    useState<TypeColorOverrides>(() => new Map());

  const setTypeColor = useCallback((typeId: VersionedUrl, color: string) => {
    setTypeColorOverrides((prev) => {
      const next = new Map(prev);
      next.set(typeId, color);
      return next;
    });
  }, []);

  const [view, _setView] = useState<VisualizerView>("Table");

  const setView = useCallback(
    (newView: VisualizerView) => {
      _setView(newView);
      setCursor(undefined);
    },
    [setCursor],
  );

  // The latest view, for the files-only auto-view effect to read without taking
  // `view` as a dependency (which would fight a manual view selection).
  const viewRef = useRef(view);
  viewRef.current = view;

  const [sort, _setSort] = useState<
    ColumnSort<SortableEntitiesTableColumnKey> & { convertTo?: BaseUrl }
  >({
    columnKey: "entityLabel",
    direction: "asc",
  });

  const setSort = useCallback(
    (
      newSort: ColumnSort<SortableEntitiesTableColumnKey> & {
        convertTo?: BaseUrl;
      },
    ) => {
      _setSort(newSort);
      setCursor(undefined);
    },
    [setCursor],
  );

  const graphSort = useMemo(
    () => generateGraphSort(sort.columnKey, sort.direction, sort.convertTo),
    [sort],
  );

  const entitiesData = useEntitiesVisualizerData({
    conversions: activeConversionsWithoutTitle
      ? typedEntries(activeConversionsWithoutTitle).map(
          ([columnBaseUrl, dataTypeId]) => ({
            path: [columnBaseUrl],
            dataTypeId,
          }),
        )
      : undefined,
    cursor,
    entityTypeBaseUrl,
    entityTypeIds: entityTypeId ? [entityTypeId] : undefined,
    filterState,
    hideColumns,
    internalWebs,
    limit: 500,
    sort: graphSort,
    view,
  });

  const [dataLoading, setDataLoading] = useState(entitiesData.loading);
  const [visualizerData, setVisualizerData] = useState(entitiesData);

  const {
    cursor: nextCursor,
    definitions,
    entities,
    closedMultiEntityTypes: closedMultiEntityTypesRootMap,
    subgraph,
  } = visualizerData;

  const closedMultiEntityTypes = useMemo(() => {
    if (!entities || !definitions || !closedMultiEntityTypesRootMap) {
      return [];
    }

    const relevantEntityTypesMap = new Map<string, ClosedMultiEntityType>();

    for (const { metadata } of entities) {
      const closedMultiEntityType = getClosedMultiEntityTypeFromMap(
        closedMultiEntityTypesRootMap,
        metadata.entityTypeIds,
      );

      const key = metadata.entityTypeIds.toSorted().join(",");

      relevantEntityTypesMap.set(key, closedMultiEntityType);
    }

    const relevantTypes = Array.from(relevantEntityTypesMap.values());

    return relevantTypes;
  }, [entities, definitions, closedMultiEntityTypesRootMap]);

  const activeConversions = useMemo(() => {
    return activeConversionsWithoutTitle
      ? Object.fromEntries(
          typedEntries(activeConversionsWithoutTitle).map(
            ([columnBaseUrl, dataTypeId]) => {
              const dataType = definitions?.dataTypes[dataTypeId];

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
        )
      : null;
  }, [activeConversionsWithoutTitle, definitions]);

  /**
   * We don't want to clear the old table data when a new request is triggered,
   * so we hold the visualizerData here rather than relying on the useEntitiesVisualizerData hook directly,
   * as it will clear the data when a new request is triggered.
   *
   * An alternative would be to have an onComplete callback in the hook.
   */
  useEffect(() => {
    setDataLoading(entitiesData.loading);

    if (!entitiesData.loading) {
      setVisualizerData(entitiesData);
    }
  }, [entitiesData]);

  const isTypePinned = !!entityTypeBaseUrl || !!entityTypeId;

  const {
    availableEntityTypes,
    propertyFilterData,
    linkEntityTypeIds,
    linkOnlyPropertyBaseUrls,
    loading: availableTypesLoading,
  } = useAvailableTypes({
    filterState,
    internalWebs,
    entityTypeBaseUrl,
    entityTypeIds: entityTypeId ? [entityTypeId] : undefined,
  });

  // The graph filters and colours nodes (non-link entities); its edges (links)
  // aren't filterable. So in the graph view the filter bar hides link types and
  // link-only properties, and the graph query drops them — but this is display /
  // query only: `filterState` keeps them, so a link filter set in the table view
  // is still there when the user switches back.
  const isGraphView = view === "NetworkGraph";
  const hiddenTypeIds = isGraphView ? linkEntityTypeIds : EMPTY_TYPE_ID_SET;
  const hiddenPropertyBaseUrls = isGraphView
    ? linkOnlyPropertyBaseUrls
    : EMPTY_BASE_URL_SET;

  // The network graph reads the same filter the table does, serialized to the exact bytes the atlas
  // manifest is POSTed — those bytes seal the view into the graph's session (see `NetworkGraphView`).
  // Stable across renders for an unchanged filter so the session is not needlessly rebound. Link-type
  // selections and link-only property filters are dropped from the graph's query — its nodes are
  // non-link entities, so a link-type clause matches nothing and a link-only property clause would
  // empty the graph — while `filterState` keeps them for the table view.
  const graphFilter = useMemo(() => {
    const selectedTypeIds = filterState.type.selectedTypeIds
      ? new Set(
          [...filterState.type.selectedTypeIds].filter(
            (typeId) => !linkEntityTypeIds.has(typeId),
          ),
        )
      : null;
    const propertyFilters = filterState.propertyFilters.filter(
      (propertyFilter) => !linkOnlyPropertyBaseUrls.has(propertyFilter.baseUrl),
    );
    return JSON.stringify(
      buildEntitiesFilter({
        filterState: {
          ...filterState,
          type: { selectedTypeIds },
          propertyFilters,
        },
        internalWebIds: internalWebs.map(({ webId }) => webId),
        pinnedEntityTypeBaseUrl: entityTypeBaseUrl,
        pinnedEntityTypeIds: entityTypeId ? [entityTypeId] : undefined,
      }),
    );
  }, [
    filterState,
    internalWebs,
    entityTypeBaseUrl,
    entityTypeId,
    linkEntityTypeIds,
    linkOnlyPropertyBaseUrls,
  ]);

  // The graph colours nodes by their (non-link) entity type, so its palette omits
  // link types.
  const graphEntityTypes = useMemo(
    () =>
      availableEntityTypes.filter(
        (type) => !linkEntityTypeIds.has(type.entityTypeId),
      ),
    [availableEntityTypes, linkEntityTypeIds],
  );

  useEffect(() => {
    if (availableTypesLoading) {
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
  ]);

  const isDisplayingFilesOnly = useMemo(
    () =>
      // Coerced to a boolean so a change between falsy shapes (e.g. `false` from
      // `every` vs `0` from an empty `length`) doesn't retrigger the effect below.
      Boolean(
        /**
         * To allow the `Grid` view to come into view on first render where
         * possible, we check whether `entityTypeId` or `entityTypeBaseUrl`
         * matches a `File` entity type from a statically defined list.
         */
        (entityTypeId && allFileEntityTypeIds.includes(entityTypeId)) ||
        (entityTypeBaseUrl &&
          allFileEntityTypeBaseUrl.includes(entityTypeBaseUrl)) ||
        /**
         * Otherwise we check the fetched `entityTypes` as a fallback.
         */
        (closedMultiEntityTypes.length &&
          closedMultiEntityTypes.every(({ allOf }) =>
            allOf.some(({ $id }) => isSpecialEntityTypeLookup?.[$id]?.isFile),
          )),
      ),
    [
      entityTypeBaseUrl,
      entityTypeId,
      closedMultiEntityTypes,
      isSpecialEntityTypeLookup,
    ],
  );

  const supportGridView = isDisplayingFilesOnly;

  // Prefer the gallery Grid view for files-only content, and leave it again once
  // the content is no longer files-only (Grid is offered only then). An explicit
  // NetworkGraph selection is never overridden: the graph is a valid view for any
  // content, so a filter that narrows the result set — or empties it — must not
  // eject the user from it (it shows its own "no results" state instead).
  useEffect(() => {
    if (viewRef.current === "NetworkGraph") {
      return;
    }
    if (isDisplayingFilesOnly) {
      setView("Grid");
    } else if (viewRef.current === "Grid") {
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

  const [showTableSearch, setShowTableSearch] = useState(false);

  const [selectedTableRows, setSelectedTableRows] = useState<
    EntitiesTableRow[]
  >([]);

  const nextPage = useCallback(() => {
    setCursor(nextCursor ?? undefined);
  }, [nextCursor]);

  const selectedEntities = useMemo(() => {
    if (view !== "Table" || selectedTableRows.length === 0 || !entities) {
      return [];
    }

    const selectedEntityIds = new Set(
      selectedTableRows.map(({ entityId }) => entityId),
    );

    return entities.filter((entity) =>
      selectedEntityIds.has(entity.metadata.recordId.entityId),
    );
  }, [entities, selectedTableRows, view]);

  const handleBulkActionCompleted = useCallback(() => {
    void entitiesData.refetch();
    setSelectedTableRows([]);
  }, [entitiesData]);

  const showLoading = !subgraph || !closedMultiEntityTypesRootMap;

  const { totalResultCount } = visualizerData;

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
              showTypeColors={view === "NetworkGraph"}
              typeColorOverrides={typeColorOverrides}
              setTypeColor={setTypeColor}
              hiddenTypeIds={hiddenTypeIds}
              hiddenPropertyBaseUrls={hiddenPropertyBaseUrls}
            />
          )
        }
        right={
          <>
            <QueryCount count={totalResultCount} loading={dataLoading} />
            <TableHeaderToggle
              value={view}
              setValue={setView}
              options={(
                [
                  "Table",
                  ...(supportGridView ? (["Grid"] as const) : []),
                  "NetworkGraph",
                ] as const satisfies VisualizerView[]
              ).map((optionValue) => ({
                icon: visualizerViewIcons[optionValue],
                label: visualizerViewLabels[optionValue],
                value: optionValue,
              }))}
            />
          </>
        }
      />
      <Box ref={contentTopRef} />
      {view === "NetworkGraph" ? (
        <Box height={availableHeight} sx={tableContentSx}>
          <NetworkGraphView
            availableEntityTypes={graphEntityTypes}
            typeColorOverrides={typeColorOverrides}
            filter={graphFilter}
            onOpenEntity={handleEntityClick}
          />
        </Box>
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
      ) : view === "Grid" ? (
        <GridView entities={entities} onEntityClick={handleEntityClick} />
      ) : (
        <EntitiesTable
          activeConversions={activeConversions}
          csvFileTitle="Entities"
          currentlyDisplayedColumnsRef={currentlyDisplayedColumnsRef}
          currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
          handleEntityClick={handleEntityClick}
          hasMoreRowsAvailable={nextCursor != null}
          loading={dataLoading}
          isViewingOnlyPages={isViewingOnlyPages}
          maxHeight={`calc(${tableHeight} - ${toolbarHeight}px)`}
          loadMoreRows={nextCursor ? nextPage : undefined}
          setActiveConversions={setActiveConversions}
          setSelectedEntityType={handleEntityTypeClick}
          setSelectedRows={setSelectedTableRows}
          selectedRows={selectedTableRows}
          showSearch={showTableSearch}
          setShowSearch={setShowTableSearch}
          sort={sort}
          setSort={setSort}
          subgraph={subgraph}
          tableData={visualizerData.tableData}
          totalResultCount={totalResultCount}
        />
      )}
    </Box>
  );
};
