import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type { SizedGridColumn } from "@glideapps/glide-data-grid";
import { LoadingSpinner } from "@hashintel/design-system";
import type { EntityQueryCursor } from "@local/hash-graph-client";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { includesPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box, Stack, useTheme } from "@mui/material";
import type { FunctionComponent, ReactElement, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useEntityTypesContextRequired } from "../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { HEADER_HEIGHT } from "../../shared/layout/layout-with-header/page-header";
import { tableContentSx } from "../../shared/table-content";
import type { FilterState } from "../../shared/table-header";
import { TableHeader, tableHeaderHeight } from "../../shared/table-header";
import { useMemoCompare } from "../../shared/use-memo-compare";
import type {
  CustomColumn,
  EntityEditorProps,
} from "../[shortname]/entities/[entity-uuid].page/entity-editor";
import { useAuthenticatedUser } from "./auth-info-context";
import { EntitiesTable } from "./entities-visualizer/entities-table";
import { GridView } from "./entities-visualizer/entities-table/grid-view";
import type { TypeEntitiesRow } from "./entities-visualizer/entities-table/use-entities-table/types";
import { useEntitiesVisualizerData } from "./entities-visualizer/use-entities-visualizer-data";
import { EntityEditorSlideStack } from "./entity-editor-slide-stack";
import { EntityGraphVisualizer } from "./entity-graph-visualizer";
import { TypeSlideOverStack } from "./entity-type-page/type-slide-over-stack";
import type {
  DynamicNodeSizing,
  GraphVizConfig,
  GraphVizFilters,
} from "./graph-visualizer";
import { generateEntityRootedSubgraph } from "./subgraphs";
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
  systemEntityTypes.image,
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

export const EntitiesVisualizer: FunctionComponent<{
  /**
   * Custom columns to display in the entities table
   */
  customColumns?: CustomColumn[];
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
   * Hide the option to open entities in a new tab
   */
  disableEntityOpenInNew?: boolean;
  /**
   * Disable clicking on a type to navigate to it
   */
  disableTypeClick?: boolean;
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
  hideColumns?: (keyof TypeEntitiesRow)[];
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
  customColumns,
  defaultFilter,
  defaultGraphConfig,
  defaultGraphFilters,
  defaultView = "Table",
  disableEntityOpenInNew,
  disableTypeClick,
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
        authenticatedUser.accountId as OwnedById,
        ...authenticatedUser.memberOf.map(
          ({ org }) => org.accountGroupId as OwnedById,
        ),
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

  const [view, setView] = useState<VisualizerView>(defaultView);

  const {
    count: totalCount,
    createdByIds,
    cursor: nextCursor,
    editionCreatedByIds,
    entities: lastLoadedEntities,
    entityTypes,
    hadCachedContent,
    loading,
    propertyTypes,
    refetch: refetchWithoutLinks,
    subgraph,
    typeIds,
    webIds,
  } = useEntitiesVisualizerData({
    cursor,
    entityTypeBaseUrl,
    entityTypeIds: entityTypeId ? [entityTypeId] : undefined,
    /**
     * Translate into archived filter in query
     */
    includeArchived: !!filterState.includeArchived,
    limit: view === "Graph" ? undefined : limit,
    ownedByIds: filterState.includeGlobal ? undefined : internalWebIds,
  });

  const loadingComponent = customLoadingComponent ?? (
    <LoadingSpinner size={42} color={theme.palette.blue[60]} />
  );

  const [selectedEntityType, setSelectedEntityType] = useState<{
    entityTypeId: VersionedUrl;
    slideContainerRef?: RefObject<HTMLDivElement | null>;
  } | null>(null);

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
      (entityTypes?.length &&
        entityTypes.every(
          ({ $id }) => isSpecialEntityTypeLookup?.[$id]?.isFile,
        )),
    [entityTypeBaseUrl, entityTypeId, entityTypes, isSpecialEntityTypeLookup],
  );

  const supportGridView = isDisplayingFilesOnly;

  useEffect(() => {
    if (isDisplayingFilesOnly) {
      setView("Grid");
    } else {
      setView(defaultView);
    }
  }, [defaultView, isDisplayingFilesOnly]);

  const entities = useMemo(
    /**
     * If a network request is in process and there is no cached content for the request, return undefined.
     * There may be stale data in the context related to an earlier request with different variables.
     */
    () => (loading && !hadCachedContent ? undefined : lastLoadedEntities),
    [hadCachedContent, loading, lastLoadedEntities],
  );

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

  const [selectedEntity, setSelectedEntity] = useState<{
    entityId: EntityId;
    options?: Pick<EntityEditorProps, "defaultOutgoingLinkFilters">;
    slideContainerRef?: RefObject<HTMLDivElement | null>;
    subgraph: Subgraph<EntityRootType>;
  } | null>(null);

  const handleEntityClick = useCallback(
    (
      entityId: EntityId,
      modalContainerRef?: RefObject<HTMLDivElement | null>,
      options?: Pick<EntityEditorProps, "defaultOutgoingLinkFilters">,
    ) => {
      if (subgraph) {
        const entitySubgraph = generateEntityRootedSubgraph(entityId, subgraph);

        setSelectedEntity({
          options,
          entityId,
          slideContainerRef: modalContainerRef,
          subgraph: entitySubgraph,
        });
      }
    },
    [subgraph],
  );

  const currentlyDisplayedColumnsRef = useRef<SizedGridColumn[] | null>(null);
  const currentlyDisplayedRowsRef = useRef<TypeEntitiesRow[] | null>(null);

  const tableHeight =
    maxHeight ??
    `min(600px, calc(100vh - (${
      HEADER_HEIGHT + TOP_CONTEXT_BAR_HEIGHT + 185 + tableHeaderHeight
    }px + ${theme.spacing(5)} + ${theme.spacing(5)})))`;

  const isPrimaryEntity = useCallback(
    (entity: { metadata: Pick<Entity["metadata"], "entityTypeIds"> }) =>
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

  const [selectedTableRows, setSelectedTableRows] = useState<TypeEntitiesRow[]>(
    [],
  );

  const nextPage = useCallback(() => {
    setCursor(nextCursor ?? undefined);
  }, [nextCursor]);

  const numberOfUserWebItems = totalCount ?? undefined;

  /**
   * @todo request global count when filtered to user webs only
   */
  const numberOfExternalItems = filterState.includeGlobal
    ? (totalCount ?? undefined)
    : undefined;

  return (
    <>
      {selectedEntityType && (
        <TypeSlideOverStack
          rootTypeId={selectedEntityType.entityTypeId}
          onClose={() => setSelectedEntityType(null)}
          slideContainerRef={selectedEntityType.slideContainerRef}
        />
      )}
      {selectedEntity ? (
        <EntityEditorSlideStack
          customColumns={customColumns}
          /*
            The subgraphWithLinkedEntities can take a long time to load with many entities.
            We pass the subgraph without linked entities so that there is _some_ data to load into the editor,
            which will be missing links. passing entityId below means the slideover fetches the entity
            with its links, so they'll load in shortly.
            It's unlikely subgraphWithLinkedEntities will be used but if it happens to be available already,
            it means the links will load in immediately.
           */
          entitySubgraph={selectedEntity.subgraph}
          disableTypeClick={disableTypeClick}
          hideOpenInNew={disableEntityOpenInNew}
          rootEntityId={selectedEntity.entityId}
          rootEntityOptions={{
            defaultOutgoingLinkFilters:
              selectedEntity.options?.defaultOutgoingLinkFilters,
          }}
          onClose={() => setSelectedEntity(null)}
          onSubmit={() => {
            throw new Error(`Editing not yet supported from this screen`);
          }}
          readonly
          /*
             If we've been given a specific DOM element to contain the modal, pass it here.
             This is for use when attaching to the body is not suitable (e.g. a specific DOM element is full-screened).
           */
          slideContainerRef={selectedEntity.slideContainerRef}
        />
      ) : null}
      <Box>
        <TableHeader
          hideFilters={hideFilters}
          internalWebIds={internalWebIds}
          itemLabelPlural={isViewingOnlyPages ? "pages" : "entities"}
          items={entities}
          selectedItems={
            entities?.filter((entity) =>
              selectedTableRows.some(
                ({ entityId }) =>
                  entity.metadata.recordId.entityId === entityId,
              ),
            ) ?? []
          }
          title="Entities"
          currentlyDisplayedColumnsRef={currentlyDisplayedColumnsRef}
          currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
          numberOfUserWebItems={numberOfUserWebItems}
          numberOfExternalItems={numberOfExternalItems}
          hideExportToCsv={view !== "Table"}
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
          setFilterState={setFilterState}
          toggleSearch={
            view === "Table" ? () => setShowTableSearch(true) : undefined
          }
          onBulkActionCompleted={() => {
            void refetchWithoutLinks();
          }}
        />
        {!subgraph ? (
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
              defaultConfig={defaultGraphConfig}
              defaultFilters={defaultGraphFilters}
              entities={entities}
              fullScreenMode={fullScreenMode}
              loadingComponent={loadingComponent}
              isPrimaryEntity={isPrimaryEntity}
              onEntityClick={handleEntityClick}
              subgraphWithTypes={subgraph}
            />
          </Box>
        ) : view === "Grid" ? (
          <GridView entities={entities} />
        ) : (
          <EntitiesTable
            createdByIds={createdByIds}
            currentlyDisplayedColumnsRef={currentlyDisplayedColumnsRef}
            currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
            editionCreatedByIds={editionCreatedByIds}
            entities={entities ?? []}
            entityTypes={entityTypes ?? []}
            filterState={filterState}
            handleEntityClick={handleEntityClick}
            hasSomeLinks={hasSomeLinks}
            hideColumns={hideColumns}
            limit={limit}
            loading={loading}
            loadingComponent={loadingComponent}
            isViewingOnlyPages={isViewingOnlyPages}
            maxHeight={tableHeight}
            goToNextPage={nextCursor ? nextPage : undefined}
            propertyTypes={propertyTypes ?? []}
            readonly={readonly}
            setSelectedEntityType={setSelectedEntityType}
            setSelectedRows={setSelectedTableRows}
            selectedRows={selectedTableRows}
            setLimit={setLimit}
            showSearch={showTableSearch}
            setShowSearch={setShowTableSearch}
            subgraph={subgraph}
            typeIds={typeIds}
            webIds={webIds}
          />
        )}
      </Box>
    </>
  );
};
