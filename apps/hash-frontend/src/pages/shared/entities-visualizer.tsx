/**
 * Displays the entities matching a filterable query as a table, a grid of
 * file previews, or an interactive graph.
 *
 * This component is a composition root: the moving parts live in
 * `entities-visualizer/` as focused hooks. Query inputs (filters, sort,
 * conversions, view) are owned by {@link useEntitiesQueryState}; the fetched
 * result pages -- including pagination -- by {@link useEntitiesVisualizerData};
 * everything else is derived from those, so there is no state
 * synchronization between them.
 */
import { Box, Stack, Typography, useTheme } from "@mui/material";
import { useCallback, useMemo, useState } from "react";

import { extractBaseUrl } from "@blockprotocol/type-system";
import { LoadingSpinner } from "@hashintel/design-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { tableContentSx } from "../../shared/table-content";
import { Button } from "../../shared/ui/button";
import {
  EntitiesTable,
  toolbarHeight,
} from "./entities-visualizer/entities-table";
import { GridView } from "./entities-visualizer/grid-view";
import { titleFromBaseUrl } from "./entities-visualizer/shared/filter-state-url";
import { useAvailableTypes } from "./entities-visualizer/shared/use-available-types";
import { useEntitiesQueryState } from "./entities-visualizer/use-entities-query-state";
import { useEntitiesVisualizerData } from "./entities-visualizer/use-entities-visualizer-data";
import { useInternalWebs } from "./entities-visualizer/use-internal-webs";
import { usePruneStaleFilters } from "./entities-visualizer/use-prune-stale-filters";
import { useSlideStackHandlers } from "./entities-visualizer/use-slide-stack-handlers";
import { useVisualizerHeights } from "./entities-visualizer/use-visualizer-heights";
import { useVisualizerView } from "./entities-visualizer/use-visualizer-view";
import { VisualizerToolbar } from "./entities-visualizer/visualizer-toolbar";
import { EntityGraphVisualizerV2 } from "./graph-visualizer-2/entity-graph-visualizer";

import type { EntitiesTableRow } from "./entities-visualizer/entities-table-data";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";
import type { FunctionComponent } from "react";

/** How many entities each request fetches; "Show more" appends another page of this size. */
const entitiesPageSize = 500;

const noSelectedRows: EntitiesTableRow[] = [];

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
  /**
   * Persist the active filter state in the URL query string (hydrating from it
   * on mount), so that refreshing, bookmarking, or sharing the page preserves
   * the filters. Defaults to `false` for embedded usages (e.g. an entity type's
   * entities tab) that should not take over the URL.
   */
  persistFilterStateInUrl?: boolean;
}> = ({
  entityTypeBaseUrl,
  entityTypeId,
  hideColumns,
  persistFilterStateInUrl = false,
}) => {
  const theme = useTheme();

  const internalWebs = useInternalWebs();

  const isTypePinned = !!entityTypeBaseUrl || !!entityTypeId;

  const {
    activeConversions,
    conversionRequests,
    entitySetKey,
    filterState,
    graphSort,
    queryView,
    selectedView,
    setActiveConversions,
    setFilterState,
    setSelectedView,
    setSort,
    sort,
  } = useEntitiesQueryState({
    entityTypeBaseUrl,
    entityTypeId,
    internalWebs,
    isTypePinned,
    persistFilterStateInUrl,
  });

  const entityTypeIds = useMemo(
    () => (entityTypeId ? [entityTypeId] : undefined),
    [entityTypeId],
  );

  const entitiesData = useEntitiesVisualizerData({
    conversions: conversionRequests,
    entityTypeBaseUrl,
    entityTypeIds,
    filterState,
    hideColumns,
    internalWebs,
    limit: entitiesPageSize,
    sort: graphSort,
    view: queryView,
  });

  const readyData = entitiesData.status === "ready" ? entitiesData : undefined;

  const {
    availableEntityTypes,
    propertyFilterData,
    loading: availableTypesLoading,
  } = useAvailableTypes({
    filterState,
    internalWebs,
    entityTypeBaseUrl,
    entityTypeIds,
  });

  usePruneStaleFilters({
    availableEntityTypes,
    availableTypesLoading,
    filterState,
    isTypePinned,
    propertyFilterData,
    setFilterState,
  });

  const { view, viewOptions } = useVisualizerView({
    closedMultiEntityTypesRootMap: readyData?.closedMultiEntityTypesRootMap,
    definitions: readyData?.definitions,
    entities: readyData?.entities,
    entityTypeBaseUrl,
    entityTypeId,
    selectedView,
  });

  const { contentTopRef, availableHeight, tableHeight } =
    useVisualizerHeights();

  const { handleEntityClick, handleEntityTypeClick, handleOpenLinkTable } =
    useSlideStackHandlers();

  /**
   * Row selection, tied to the entity set it was made against: when the
   * filters change, the rows the selection referred to are no longer the
   * displayed set, so it is implicitly dropped (no reset effect needed).
   * Sorting, unit conversions and pagination keep the same set, so the
   * selection survives those.
   */
  const [tableSelection, setTableSelection] = useState<{
    forEntitySetKey: string;
    rows: EntitiesTableRow[];
  } | null>(null);

  const selectedTableRows =
    tableSelection !== null && tableSelection.forEntitySetKey === entitySetKey
      ? tableSelection.rows
      : noSelectedRows;

  const setSelectedTableRows = useCallback(
    (rows: EntitiesTableRow[]) => {
      setTableSelection({ forEntitySetKey: entitySetKey, rows });
    },
    [entitySetKey],
  );

  const entities = readyData?.entities;

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

  const refresh = readyData?.refresh;

  const handleBulkActionCompleted = useCallback(() => {
    refresh?.();
    setTableSelection(null);
  }, [refresh]);

  const definitions = readyData?.definitions;

  /**
   * The active conversions enriched with each target data type's display
   * title. `definitions` comes from the last-loaded response, so a
   * just-activated conversion's target may not be in the pool until the
   * converted response lands -- fall back to a title derived from the type's
   * URL slug for that window.
   */
  const activeConversionsWithTitles = useMemo(() => {
    if (!activeConversions) {
      return null;
    }

    return Object.fromEntries(
      typedEntries(activeConversions).map(([columnBaseUrl, dataTypeId]) => [
        columnBaseUrl,
        {
          dataTypeId,
          title:
            definitions?.dataTypes[dataTypeId]?.schema.title ??
            titleFromBaseUrl(extractBaseUrl(dataTypeId)),
        },
      ]),
    );
  }, [activeConversions, definitions]);

  const isViewingOnlyPages =
    entityTypeBaseUrl === systemEntityTypes.page.entityTypeBaseUrl ||
    entityTypeId === systemEntityTypes.page.entityTypeId;

  // A stable element, so passing it to the memoized graph visualizer doesn't
  // re-render it every time this component renders.
  const loadingSpinner = useMemo(
    () => <LoadingSpinner size={42} color={theme.palette.blue[60]} />,
    [theme],
  );

  return (
    <Box>
      <VisualizerToolbar
        availableEntityTypes={availableEntityTypes}
        availableTypesLoading={availableTypesLoading}
        filterState={filterState}
        internalWebs={internalWebs}
        isTypePinned={isTypePinned}
        onBulkActionCompleted={handleBulkActionCompleted}
        propertyFilterData={propertyFilterData}
        selectedEntities={selectedEntities}
        setFilterState={setFilterState}
        setView={setSelectedView}
        totalResultCount={entitiesData.totalResultCount}
        totalResultCountLoading={entitiesData.fetching}
        view={view}
        viewOptions={viewOptions}
      />
      <Box ref={contentTopRef} />
      {entitiesData.status === "error" ? (
        <Stack
          sx={[
            {
              alignItems: "center",
              justifyContent: "center",
              height: tableHeight,
              px: 4,
              width: "100%",
            },
            tableContentSx,
          ]}
        >
          <Typography
            variant="smallTextLabels"
            sx={{ color: ({ palette }) => palette.red[90], fontWeight: 600 }}
          >
            Could not load entities
          </Typography>
          <Typography
            variant="smallTextParagraphs"
            sx={{
              color: ({ palette }) => palette.gray[70],
              maxWidth: 560,
              mt: 0.75,
              textAlign: "center",
            }}
          >
            {entitiesData.error.message}
          </Typography>
          <Button onClick={entitiesData.retry} size="small" sx={{ mt: 2 }}>
            Try again
          </Button>
        </Stack>
      ) : !readyData ? (
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
          <Box>{loadingSpinner}</Box>
        </Stack>
      ) : view === "Graph" ? (
        <Box height={availableHeight} sx={tableContentSx}>
          <EntityGraphVisualizerV2
            entities={readyData.entities}
            rootEntityIds={readyData.rootEntityIds}
            sourceKey={entitySetKey}
            closedMultiEntityTypesRootMap={
              readyData.closedMultiEntityTypesRootMap
            }
            definitions={readyData.definitions}
            loadingComponent={loadingSpinner}
            onEntityClick={handleEntityClick}
            onOpenLinkTable={handleOpenLinkTable}
          />
        </Box>
      ) : view === "Grid" ? (
        <GridView
          entities={readyData.entities}
          onEntityClick={handleEntityClick}
        />
      ) : (
        <EntitiesTable
          activeConversions={activeConversionsWithTitles}
          csvFileTitle="Entities"
          handleEntityClick={handleEntityClick}
          hasMoreRowsAvailable={readyData.hasNextPage}
          loading={entitiesData.fetching}
          isViewingOnlyPages={isViewingOnlyPages}
          maxHeight={`calc(${tableHeight} - ${toolbarHeight}px)`}
          loadMoreRows={readyData.fetchNextPage}
          setActiveConversions={setActiveConversions}
          setSelectedEntityType={handleEntityTypeClick}
          setSelectedRows={setSelectedTableRows}
          selectedRows={selectedTableRows}
          sort={sort}
          setSort={setSort}
          tableData={readyData.tableData}
          totalResultCount={entitiesData.totalResultCount}
        />
      )}
    </Box>
  );
};
