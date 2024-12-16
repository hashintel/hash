import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type { SizedGridColumn } from "@glideapps/glide-data-grid";
import { LoadingSpinner } from "@hashintel/design-system";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { includesPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { PageProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box, Stack, useTheme } from "@mui/material";
import type { FunctionComponent, ReactElement, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useEntityTypeEntitiesContext } from "../../shared/entity-type-entities-context";
import { useEntityTypesContextRequired } from "../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { HEADER_HEIGHT } from "../../shared/layout/layout-with-header/page-header";
import { tableContentSx } from "../../shared/table-content";
import type { FilterState } from "../../shared/table-header";
import { TableHeader, tableHeaderHeight } from "../../shared/table-header";
import { useEntityTypeEntities } from "../../shared/use-entity-type-entities";
import { useMemoCompare } from "../../shared/use-memo-compare";
import type {
  CustomColumn,
  EntityEditorProps,
} from "../[shortname]/entities/[entity-uuid].page/entity-editor";
import { useAuthenticatedUser } from "./auth-info-context";
import { EntitiesTable } from "./entities-table";
import { GridView } from "./entities-table/grid-view";
import type { TypeEntitiesRow } from "./entities-table/use-entities-table/types";
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
  customColumns?: CustomColumn[];
  defaultFilter?: FilterState;
  defaultGraphConfig?: GraphVizConfig<DynamicNodeSizing>;
  defaultGraphFilters?: GraphVizFilters;
  defaultView?: VisualizerView;
  disableEntityOpenInNew?: boolean;
  disableTypeClick?: boolean;
  /**
   * If the user activates fullscreen, whether to fullscreen the whole page or a specific element, e.g. the graph only.
   * Currently only used in the context of the graph visualizer, but the table could be usefully fullscreened as well.
   */
  fullScreenMode?: "document" | "element";
  hideFilters?: boolean;
  hideColumns?: (keyof TypeEntitiesRow)[];
  loadingComponent?: ReactElement;
  maxHeight?: string | number;
  readonly?: boolean;
}> = ({
  customColumns,
  defaultFilter,
  defaultGraphConfig,
  defaultGraphFilters,
  defaultView = "Table",
  disableEntityOpenInNew,
  disableTypeClick,
  fullScreenMode,
  hideColumns,
  hideFilters,
  loadingComponent: customLoadingComponent,
  maxHeight,
  readonly,
}) => {
  const theme = useTheme();

  const { authenticatedUser } = useAuthenticatedUser();

  const [filterState, setFilterState] = useState<FilterState>(
    defaultFilter ?? {
      includeGlobal: false,
      limitToWebs: false,
    },
  );

  const loadingComponent = customLoadingComponent ?? (
    <LoadingSpinner size={42} color={theme.palette.blue[60]} />
  );

  const [selectedEntityType, setSelectedEntityType] = useState<{
    entityTypeId: VersionedUrl;
    slideContainerRef?: RefObject<HTMLDivElement>;
  } | null>(null);

  const {
    entityTypeBaseUrl,
    entityTypeId,
    entities: lastLoadedEntities,
    entityTypes,
    hadCachedContent,
    loading,
    propertyTypes,
    refetch: refetchWithoutLinks,
    subgraph: subgraphPossiblyWithoutLinks,
  } = useEntityTypeEntitiesContext();

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

  const [view, setView] = useState<VisualizerView>(
    isDisplayingFilesOnly ? "Grid" : defaultView,
  );

  useEffect(() => {
    if (isDisplayingFilesOnly) {
      setView("Grid");
    } else {
      setView(defaultView);
    }
  }, [defaultView, isDisplayingFilesOnly]);

  const { subgraph: subgraphWithLinkedEntities, refetch: refetchWithLinks } =
    useEntityTypeEntities({
      entityTypeBaseUrl,
      entityTypeId,
      graphResolveDepths: {
        constrainsLinksOn: { outgoing: 255 },
        constrainsLinkDestinationsOn: { outgoing: 255 },
        constrainsPropertiesOn: { outgoing: 255 },
        constrainsValuesOn: { outgoing: 255 },
        inheritsFrom: { outgoing: 255 },
        isOfType: { outgoing: 1 },
        hasLeftEntity: { outgoing: 1, incoming: 1 },
        hasRightEntity: { outgoing: 1, incoming: 1 },
      },
    });

  /**
   The subgraphWithLinkedEntities can take a long time to load with many entities.
   If absent, we pass the subgraph without linked entities so that there is _some_ data to load into the slideover,
   which will be missing links until they load in by specifically fetching selectedEntity.entityId
   */
  const subgraph = subgraphWithLinkedEntities ?? subgraphPossiblyWithoutLinks;

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

  const internalWebIds = useMemoCompare(
    () => {
      return [
        authenticatedUser.accountId,
        ...authenticatedUser.memberOf.map(({ org }) => org.accountGroupId),
      ];
    },
    [authenticatedUser],
    (oldValue, newValue) => {
      const oldSet = new Set(oldValue);
      const newSet = new Set(newValue);
      return oldSet.size === newSet.size && oldSet.isSubsetOf(newSet);
    },
  );

  const filteredEntities = useMemo(() => {
    return entities?.filter(
      (entity) =>
        (filterState.includeGlobal
          ? true
          : internalWebIds.includes(
              extractOwnedByIdFromEntityId(entity.metadata.recordId.entityId),
            )) &&
        (filterState.includeArchived === undefined ||
        filterState.includeArchived ||
        includesPageEntityTypeId(entity.metadata.entityTypeIds)
          ? simplifyProperties(entity.properties as PageProperties).archived !==
            true
          : /**
             * @todo H-2633 use entity archival via temporal axes, not metadata boolean
             */
            !entity.metadata.archived) &&
        (filterState.limitToWebs
          ? filterState.limitToWebs.includes(
              extractOwnedByIdFromEntityId(entity.metadata.recordId.entityId),
            )
          : true),
    );
  }, [entities, filterState, internalWebIds]);

  const [selectedEntity, setSelectedEntity] = useState<{
    entityId: EntityId;
    options?: Pick<EntityEditorProps, "defaultOutgoingLinkFilters">;
    slideContainerRef?: RefObject<HTMLDivElement>;
    subgraph: Subgraph<EntityRootType>;
  } | null>(null);

  const handleEntityClick = useCallback(
    (
      entityId: EntityId,
      modalContainerRef?: RefObject<HTMLDivElement>,
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

  const maximumTableHeight =
    maxHeight ??
    `calc(100vh - (${
      HEADER_HEIGHT + TOP_CONTEXT_BAR_HEIGHT + 185 + tableHeaderHeight
    }px + ${theme.spacing(5)} + ${theme.spacing(5)}))`;

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
            void refetchWithLinks();
          }}
        />
        {!subgraph ? (
          <Stack
            alignItems="center"
            justifyContent="center"
            sx={[
              {
                height: maximumTableHeight,
                width: "100%",
              },
              tableContentSx,
            ]}
          >
            <Box>{loadingComponent}</Box>
          </Stack>
        ) : view === "Graph" ? (
          <Box height={maximumTableHeight} sx={tableContentSx}>
            <EntityGraphVisualizer
              defaultConfig={defaultGraphConfig}
              defaultFilters={defaultGraphFilters}
              entities={filteredEntities}
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
            currentlyDisplayedColumnsRef={currentlyDisplayedColumnsRef}
            currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
            entities={filteredEntities ?? []}
            entityTypes={entityTypes ?? []}
            filterState={filterState}
            handleEntityClick={handleEntityClick}
            hasSomeLinks={hasSomeLinks}
            hideColumns={hideColumns}
            loading={loading}
            loadingComponent={loadingComponent}
            isViewingOnlyPages={isViewingOnlyPages}
            maxHeight={maxHeight}
            propertyTypes={propertyTypes ?? []}
            readonly={readonly}
            setSelectedEntityType={setSelectedEntityType}
            setSelectedRows={setSelectedTableRows}
            selectedRows={selectedTableRows}
            showSearch={showTableSearch}
            setShowSearch={setShowTableSearch}
            subgraph={subgraph}
          />
        )}
      </Box>
    </>
  );
};
