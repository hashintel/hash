import { Box, Stack, useTheme } from "@mui/material";
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
import { useMemoCompare } from "../../shared/use-memo-compare";
import { useAuthenticatedUser } from "./auth-info-context";
import { createDefaultFilterState } from "./entities-visualizer/data/types";
import { useAvailableTypes } from "./entities-visualizer/data/use-available-types";
import { EntitiesTable } from "./entities-visualizer/entities-table";
import { GridView } from "./entities-visualizer/entities-table/grid-view";
import {
  TableToolbar,
  toolbarHeight,
} from "./entities-visualizer/entities-table/table-toolbar";
import { FilterRibbon } from "./entities-visualizer/header/filter-ribbon";
import { QueryCount } from "./entities-visualizer/header/query-count";
import {
  VisualizerHeader,
  visualizerHeaderHeight,
} from "./entities-visualizer/header/visualizer-header";
import { useEntitiesVisualizerData } from "./entities-visualizer/use-entities-visualizer-data";
import { EntityGraphVisualizer } from "./entity-graph-visualizer";
import { useSlideStack } from "./slide-stack";
import { TableHeaderToggle } from "./table-header-toggle";
import { TOP_CONTEXT_BAR_HEIGHT } from "./top-context-bar";
import { visualizerViewIcons } from "./visualizer-views";

import type { ColumnSort } from "../../components/grid/utils/sorting";
import type { EntitiesFilterState } from "./entities-visualizer/data/types";
import type {
  EntitiesTableRow,
  SortableEntitiesTableColumnKey,
} from "./entities-visualizer/types";
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

  const internalWebIds = useMemoCompare(
    () => {
      return [
        authenticatedUser.accountId as WebId,
        ...authenticatedUser.memberOf.map(({ org }) => org.webId),
      ];
    },
    [authenticatedUser],
    (oldValue, newValue) => {
      const oldSet = new Set(oldValue);
      const newSet = new Set(newValue);
      return oldSet.size === newSet.size && oldSet.isSubsetOf(newSet);
    },
  );

  const [filterState, _setFilterState] = useState<EntitiesFilterState>(() =>
    createDefaultFilterState(internalWebIds),
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
    internalWebIds,
    limit: view === "Graph" ? undefined : 500,
    sort: graphSort,
    view,
  });

  const [dataLoading, setDataLoading] = useState(entitiesData.loading);
  const [visualizerData, setVisualizerData] = useState(entitiesData);

  const {
    count: totalCountFromEntityRequest,
    cursor: nextCursor,
    definitions,
    entities,
    closedMultiEntityTypes: closedMultiEntityTypesRootMap,
    subgraph,
    webIds,
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

  const totalResultCount = totalCountFromEntityRequest ?? null;

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

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

  const tableHeight = `min(600px, calc(100vh - ${
    contentTop != null
      ? `${contentTop}px - ${theme.spacing(5)}`
      : `(${
          HEADER_HEIGHT + TOP_CONTEXT_BAR_HEIGHT + 230 + visualizerHeaderHeight
        }px + ${theme.spacing(5)} + ${theme.spacing(5)})`
  }))`;

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

  const isTypePinned = !!entityTypeBaseUrl || !!entityTypeId;

  const { types: availableTypes, loading: availableTypesLoading } =
    useAvailableTypes({
      filterState,
      internalWebIds,
      entityTypeBaseUrl,
      entityTypeIds: entityTypeId ? [entityTypeId] : undefined,
    });

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
              availableTypes={availableTypes}
              availableTypesLoading={availableTypesLoading}
              filterState={filterState}
              internalWebIds={internalWebIds}
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
      {showLoading ? (
        <Stack
          alignItems="center"
          justifyContent="center"
          sx={[
            {
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
        <Box height={tableHeight} sx={tableContentSx}>
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
          <TableToolbar
            csvFileTitle="Entities"
            currentlyDisplayedColumnsRef={currentlyDisplayedColumnsRef}
            currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
            displayedColumns={visualizerData.tableData?.columns ?? []}
            showSearch={showTableSearch}
            setShowSearch={setShowTableSearch}
            sort={sort}
            setSort={setSort}
          />
          <EntitiesTable
            activeConversions={activeConversions}
            currentlyDisplayedColumnsRef={currentlyDisplayedColumnsRef}
            currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
            definitions={definitions}
            handleEntityClick={handleEntityClick}
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
            webIds={webIds}
          />
        </>
      )}
    </Box>
  );
};
