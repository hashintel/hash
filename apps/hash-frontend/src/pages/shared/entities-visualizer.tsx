import { useQuery } from "@apollo/client";
import type {
  BaseUrl,
  ClosedMultiEntityType,
  EntityId,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import { extractBaseUrl, isBaseUrl } from "@blockprotocol/type-system";
import type { SizedGridColumn } from "@glideapps/glide-data-grid";
import { LoadingSpinner } from "@hashintel/design-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type {
  EntityQueryCursor,
  EntityQuerySortingPath,
  EntityQuerySortingRecord,
  EntityQuerySortingToken,
  NullOrdering,
  Ordering,
} from "@local/hash-graph-client";
import {
  getClosedMultiEntityTypeFromMap,
  type HashEntity,
} from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { includesPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { Box, Stack, useTheme } from "@mui/material";
import type { FunctionComponent, ReactElement } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ColumnSort } from "../../components/grid/utils/sorting";
import type {
  CountEntitiesQuery,
  CountEntitiesQueryVariables,
} from "../../graphql/api-types.gen";
import { countEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { useEntityTypesContextRequired } from "../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { HEADER_HEIGHT } from "../../shared/layout/layout-with-header/page-header";
import { tableContentSx } from "../../shared/table-content";
import type { FilterState } from "../../shared/table-header";
import { TableHeader, tableHeaderHeight } from "../../shared/table-header";
import { generateUseEntityTypeEntitiesFilter } from "../../shared/use-entity-type-entities";
import { useMemoCompare } from "../../shared/use-memo-compare";
import { usePollInterval } from "../../shared/use-poll-interval";
import { useAuthenticatedUser } from "./auth-info-context";
import { EntitiesTable } from "./entities-visualizer/entities-table";
import { GridView } from "./entities-visualizer/entities-table/grid-view";
import type {
  EntitiesTableRow,
  SortableEntitiesTableColumnKey,
} from "./entities-visualizer/entities-table/types";
import { useEntitiesVisualizerData } from "./entities-visualizer/use-entities-visualizer-data";
import type { EntityEditorProps } from "./entity/entity-editor";
import { EntityGraphVisualizer } from "./entity-graph-visualizer";
import type {
  DynamicNodeSizing,
  GraphVizConfig,
  GraphVizFilters,
} from "./graph-visualizer";
import { useSlideStack } from "./slide-stack";
import { TableHeaderToggle } from "./table-header-toggle";
import { TOP_CONTEXT_BAR_HEIGHT } from "./top-context-bar";
import type { VisualizerView } from "./visualizer-views";
import { visualizerViewIcons } from "./visualizer-views";

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
        "recordCreatedAtTransactionTime" satisfies EntityQuerySortingToken,
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
   * The default filter to apply
   */
  defaultFilter?: FilterState;
  /**
   * The default graph configuration to apply
   */
  defaultGraphConfig?: GraphVizConfig<DynamicNodeSizing>;
  /**
   * The default graph filters to apply
   */
  defaultGraphFilters?: GraphVizFilters;
  /**
   * The default visualizer view
   */
  defaultView?: VisualizerView;
  /**
   * Limit the entities displayed to only those matching any version of this type
   */
  entityTypeBaseUrl?: BaseUrl;
  /**
   * Limit the entities displayed to only those matching this exact type version
   */
  entityTypeId?: VersionedUrl;
  /**
   * If the user activates fullscreen, whether to fullscreen the whole page or a specific element, e.g. the graph only.
   * Currently only used in the context of the graph visualizer, but the table could be usefully fullscreened as well.
   */
  fullScreenMode?: "document" | "element";
  /**
   * Hide the internal/external and archived filter controls
   */
  hideFilters?: boolean;
  /**
   * Hide specific columns from the table
   */
  hideColumns?: (keyof EntitiesTableRow)[];
  /**
   * A custom component to display while loading data
   */
  loadingComponent?: ReactElement;
  /**
   * The maximum height of the visualizer
   */
  maxHeight?: string | number;
  /**
   * Whether to display in readonly mode (functionality such as archiving entities will be disabled)
   */
  readonly?: boolean;
}> = ({
  defaultFilter,
  defaultGraphConfig,
  defaultGraphFilters,
  defaultView = "Table",
  entityTypeBaseUrl,
  entityTypeId,
  fullScreenMode,
  hideColumns,
  hideFilters,
  loadingComponent: customLoadingComponent,
  maxHeight,
  readonly,
}) => {
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

  const [filterState, setFilterState] = useState<FilterState>(
    defaultFilter ?? {
      includeGlobal: false,
      limitToWebs: false,
    },
  );

  const [limit, setLimit] = useState<number>(10);
  const [cursor, setCursor] = useState<EntityQueryCursor>();
  const [activeConversionsWithoutTitle, setActiveConversions] = useState<{
    [columnBaseUrl: BaseUrl]: VersionedUrl;
  } | null>(null);

  const [view, setView] = useState<VisualizerView>(defaultView);

  const pollInterval = usePollInterval();

  /**
   * We want to show the count of entities in external webs, and need to query this count separately:
   * 1. When the user is requesting entities in their web only, the count for the main query doesn't include external webs.
   * 2. When the user is requesting all entities, the count for the main query includes BOTH internal and external entities.
   *
   * So we need the count of external entities in both cases.
   */
  const { data: externalWebsOnlyCountData } = useQuery<
    CountEntitiesQuery,
    CountEntitiesQueryVariables
  >(countEntitiesQuery, {
    pollInterval,
    variables: {
      request: {
        filter: generateUseEntityTypeEntitiesFilter({
          excludeWebIds: internalWebIds,
          entityTypeBaseUrl,
          entityTypeIds: entityTypeId ? [entityTypeId] : undefined,
          includeArchived: !!filterState.includeArchived,
        }),
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
      },
    },
    fetchPolicy: "network-only",
  });

  const [sort, setSort] = useState<
    ColumnSort<SortableEntitiesTableColumnKey> & { convertTo?: BaseUrl }
  >({
    columnKey: "entityLabel",
    direction: "asc",
  });

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
    /**
     * Translate into archived filter in query
     */
    includeArchived: !!filterState.includeArchived,
    /** @todo H-3255 enable pagination when performance improvements in place */
    // limit: view === "Graph" ? undefined : limit,
    webIds: filterState.includeGlobal ? undefined : internalWebIds,
    sort: graphSort,
  });

  const [dataLoading, setDataLoading] = useState(entitiesData.loading);
  const [visualizerData, setVisualizerData] = useState(entitiesData);

  const {
    count: totalCount,
    createdByIds,
    cursor: nextCursor,
    definitions,
    editionCreatedByIds,
    entities,
    closedMultiEntityTypes: closedMultiEntityTypesRootMap,
    refetch: refetchWithoutLinks,
    subgraph,
    typeIds,
    typeTitles,
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

  const [childDoingWork, setChildDoingWork] = useState(false);

  const internalEntitiesCount =
    externalWebsOnlyCountData?.countEntities == null || totalCount == null
      ? undefined
      : filterState.includeGlobal
        ? totalCount - externalWebsOnlyCountData.countEntities
        : totalCount;

  const loadingComponent = customLoadingComponent ?? (
    <LoadingSpinner size={42} color={theme.palette.blue[60]} />
  );

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
      setView(defaultView);
    }
  }, [defaultView, isDisplayingFilesOnly]);

  const { isViewingOnlyPages, hasSomeLinks } = useMemo(() => {
    let isViewingPages = true;
    let hasLinks = false;
    for (const entity of entities ?? []) {
      if (!includesPageEntityTypeId(entity.metadata.entityTypeIds)) {
        isViewingPages = false;
      }
      if (entity.linkData) {
        hasLinks = true;
      }

      if (hasLinks && !isViewingPages) {
        break;
      }
    }
    return { isViewingOnlyPages: isViewingPages, hasSomeLinks: hasLinks };
  }, [entities]);

  useEffect(() => {
    if (isViewingOnlyPages && filterState.includeArchived === undefined) {
      setFilterState((prev) => ({ ...prev, includeArchived: false }));
    }
  }, [isViewingOnlyPages, filterState]);

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

  const tableHeight =
    maxHeight ??
    `min(600px, calc(100vh - (${
      HEADER_HEIGHT + TOP_CONTEXT_BAR_HEIGHT + 185 + tableHeaderHeight
    }px + ${theme.spacing(5)} + ${theme.spacing(5)})))`;

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

  return (
    <Box>
      <TableHeader
        currentlyDisplayedColumnsRef={currentlyDisplayedColumnsRef}
        currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
        endAdornment={
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
        }
        filterState={filterState}
        hideExportToCsv={view !== "Table"}
        hideFilters={hideFilters}
        itemLabelPlural={isViewingOnlyPages ? "pages" : "entities"}
        loading={dataLoading || childDoingWork}
        onBulkActionCompleted={() => {
          void refetchWithoutLinks();
        }}
        numberOfExternalItems={
          externalWebsOnlyCountData?.countEntities ?? undefined
        }
        numberOfUserWebItems={internalEntitiesCount}
        selectedItems={
          entities?.filter((entity) =>
            selectedTableRows.some(
              ({ entityId }) => entity.metadata.recordId.entityId === entityId,
            ),
          ) ?? []
        }
        setFilterState={setFilterState}
        title="Entities"
        toggleSearch={
          view === "Table"
            ? () => setShowTableSearch(!showTableSearch)
            : undefined
        }
      />
      {!subgraph || !closedMultiEntityTypesRootMap ? (
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
          <Box>{loadingComponent}</Box>
        </Stack>
      ) : view === "Graph" ? (
        <Box height={tableHeight} sx={tableContentSx}>
          <EntityGraphVisualizer
            closedMultiEntityTypesRootMap={closedMultiEntityTypesRootMap}
            defaultConfig={defaultGraphConfig}
            defaultFilters={defaultGraphFilters}
            entities={entities}
            fullScreenMode={fullScreenMode}
            loadingComponent={loadingComponent}
            isPrimaryEntity={isPrimaryEntity}
            onEntityClick={handleEntityClick}
          />
        </Box>
      ) : view === "Grid" ? (
        <GridView entities={entities} onEntityClick={handleEntityClick} />
      ) : (
        <EntitiesTable
          activeConversions={activeConversions}
          createdByIds={createdByIds}
          currentlyDisplayedColumnsRef={currentlyDisplayedColumnsRef}
          currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
          closedMultiEntityTypesRootMap={closedMultiEntityTypesRootMap}
          definitions={definitions}
          editionCreatedByIds={editionCreatedByIds}
          entities={entities}
          filterState={filterState}
          handleEntityClick={handleEntityClick}
          hasSomeLinks={hasSomeLinks}
          hideColumns={hideColumns}
          limit={limit}
          loading={dataLoading}
          loadingComponent={loadingComponent}
          isViewingOnlyPages={isViewingOnlyPages}
          maxHeight={tableHeight}
          goToNextPage={nextCursor ? nextPage : undefined}
          readonly={readonly}
          setActiveConversions={setActiveConversions}
          setLoading={setChildDoingWork}
          setSelectedEntityType={handleEntityTypeClick}
          setSelectedRows={setSelectedTableRows}
          selectedRows={selectedTableRows}
          setLimit={setLimit}
          showSearch={showTableSearch}
          setShowSearch={setShowTableSearch}
          sort={sort}
          setSort={setSort}
          subgraph={subgraph}
          typeIds={typeIds}
          typeTitles={typeTitles}
          webIds={webIds}
        />
      )}
    </Box>
  );
};
