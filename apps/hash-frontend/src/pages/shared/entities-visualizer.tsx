import { Box, Stack, Typography, useTheme } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { extractBaseUrl, isBaseUrl } from "@blockprotocol/type-system";
import { LoadingSpinner } from "@hashintel/design-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import {
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
import { createDefaultFilterState } from "./entities-visualizer/shared/filter-state";
import { useAvailableTypes } from "./entities-visualizer/shared/use-available-types";
import { useEntitiesVisualizerData } from "./entities-visualizer/use-entities-visualizer-data";
import { EntityGraphVisualizer } from "./entity-graph-visualizer";
import { useSlideStack } from "./slide-stack";
import { TableHeaderToggle } from "./table-header-toggle";
import { TOP_CONTEXT_BAR_HEIGHT } from "./top-context-bar";
import { visualizerViewIcons } from "./visualizer-views";

import type { ColumnSort } from "../../components/grid/utils/sorting";
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

  const [view, _setView] = useState<VisualizerView>("Table");

  const setView = useCallback(
    (newView: VisualizerView) => {
      _setView(newView);
      setCursor(undefined);
    },
    [setCursor],
  );

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

  const isTypePinned = !!entityTypeBaseUrl || !!entityTypeId;

  const {
    availableEntityTypes,
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
  });

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
    typeUniverse,
    typeUniverseError,
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

  // The universe only feeds the default view — with a pinned type or an
  // explicit selection the main query runs on its own type clause, so a failed
  // summary must not blank results that still load.
  const typeUniverseBlocksResults =
    !!typeUniverseError &&
    !isTypePinned &&
    filterState.type.selectedTypeIds === null;

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
      {typeUniverseBlocksResults ? (
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
          <Button
            onClick={() => {
              void refetchTypeUniverse();
            }}
            size="small"
          >
            Try again
          </Button>
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
