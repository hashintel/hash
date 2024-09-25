import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type { CustomCell, Item, TextCell } from "@glideapps/glide-data-grid";
import { GridCellKind } from "@glideapps/glide-data-grid";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import { gridRowHeight } from "@local/hash-isomorphic-utils/data-grid";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { isPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { PageProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  type EntityRootType,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
  type Subgraph,
} from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box, useTheme } from "@mui/material";
import { useRouter } from "next/router";
import type { FunctionComponent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { GridProps } from "../../components/grid/grid";
import {
  Grid,
  gridHeaderHeightWithBorder,
  gridHorizontalScrollbarHeight,
} from "../../components/grid/grid";
import type { BlankCell } from "../../components/grid/utils";
import { blankCell } from "../../components/grid/utils";
import type { CustomIcon } from "../../components/grid/utils/custom-grid-icons";
import type { ColumnFilter } from "../../components/grid/utils/filtering";
import { useEntityTypeEntitiesContext } from "../../shared/entity-type-entities-context";
import { useEntityTypesContextRequired } from "../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { HEADER_HEIGHT } from "../../shared/layout/layout-with-header/page-header";
import type { FilterState } from "../../shared/table-header";
import { TableHeader, tableHeaderHeight } from "../../shared/table-header";
import type { MinimalActor } from "../../shared/use-actors";
import { isAiMachineActor } from "../../shared/use-actors";
import { useEntityTypeEntities } from "../../shared/use-entity-type-entities";
import { EditEntitySlideOver } from "../[shortname]/entities/[entity-uuid].page/edit-entity-slide-over";
import { useAuthenticatedUser } from "./auth-info-context";
import { renderChipCell } from "./chip-cell";
import { GridView } from "./entities-table/grid-view";
import type { TextIconCell } from "./entities-table/text-icon-cell";
import { createRenderTextIconCell } from "./entities-table/text-icon-cell";
import type { TypeEntitiesRow } from "./entities-table/use-entities-table";
import { useEntitiesTable } from "./entities-table/use-entities-table";
import { useGetEntitiesTableAdditionalCsvData } from "./entities-table/use-get-entities-table-additional-csv-data";
import { EntityGraphVisualizer } from "./entity-graph-visualizer";
import { TypeSlideOverStack } from "./entity-type-page/type-slide-over-stack";
import { generateEntityRootedSubgraph } from "./subgraphs";
import { TableHeaderToggle } from "./table-header-toggle";
import type { TableView } from "./table-views";
import { tableViewIcons } from "./table-views";
import { TOP_CONTEXT_BAR_HEIGHT } from "./top-context-bar";

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

export const EntitiesTable: FunctionComponent<{
  hideEntityTypeVersionColumn?: boolean;
  hidePropertiesColumns?: boolean;
}> = ({ hideEntityTypeVersionColumn, hidePropertiesColumns = false }) => {
  const router = useRouter();

  const { authenticatedUser } = useAuthenticatedUser();

  const [filterState, setFilterState] = useState<FilterState>({
    includeGlobal: false,
    limitToWebs: false,
  });
  const [showSearch, setShowSearch] = useState<boolean>(false);

  const [selectedEntityTypeId, setSelectedEntityTypeId] =
    useState<VersionedUrl | null>(null);

  const {
    entityTypeBaseUrl,
    entityTypeId,
    entities: lastLoadedEntities,
    entityTypes,
    hadCachedContent,
    loading,
    propertyTypes,
    subgraph: subgraphWithoutLinkedEntities,
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

  const [view, setView] = useState<TableView>(
    isDisplayingFilesOnly ? "Grid" : "Table",
  );

  useEffect(() => {
    if (isDisplayingFilesOnly) {
      setView("Grid");
    } else {
      setView("Table");
    }
  }, [isDisplayingFilesOnly]);

  const { subgraph: subgraphWithLinkedEntities } = useEntityTypeEntities({
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

  const subgraph = subgraphWithLinkedEntities ?? subgraphWithoutLinkedEntities;

  const entities = useMemo(
    /**
     * If a network request is in process and there is no cached content for the request, return undefined.
     * There may be stale data in the context related to an earlier request with different variables.
     */
    () => (loading && !hadCachedContent ? undefined : lastLoadedEntities),
    [hadCachedContent, loading, lastLoadedEntities],
  );

  const isViewingPages = useMemo(
    () =>
      !!entities?.length &&
      entities.every(({ metadata }) =>
        isPageEntityTypeId(metadata.entityTypeId),
      ),
    [entities],
  );

  useEffect(() => {
    if (isViewingPages && filterState.includeArchived === undefined) {
      setFilterState((prev) => ({ ...prev, includeArchived: false }));
    }
  }, [isViewingPages, filterState]);

  const internalWebIds = useMemo(() => {
    return [
      authenticatedUser.accountId,
      ...authenticatedUser.memberOf.map(({ org }) => org.accountGroupId),
    ];
  }, [authenticatedUser]);

  const filteredEntities = useMemo(
    () =>
      entities?.filter(
        (entity) =>
          (filterState.includeGlobal
            ? true
            : internalWebIds.includes(
                extractOwnedByIdFromEntityId(entity.metadata.recordId.entityId),
              )) &&
          (filterState.includeArchived === undefined ||
          filterState.includeArchived ||
          !isPageEntityTypeId(entity.metadata.entityTypeId)
            ? true
            : simplifyProperties(entity.properties as PageProperties)
                .archived !== true),
      ),
    [entities, filterState, internalWebIds],
  );

  const { columns, rows } = useEntitiesTable({
    entities: filteredEntities,
    entityTypes,
    propertyTypes,
    subgraph,
    hidePageArchivedColumn: !filterState.includeArchived,
    hideEntityTypeVersionColumn,
    hidePropertiesColumns,
    isViewingPages,
  });

  const [selectedRows, setSelectedRows] = useState<TypeEntitiesRow[]>([]);

  const [selectedEntitySubgraph, setSelectedEntitySubgraph] =
    useState<Subgraph<EntityRootType> | null>(null);

  const handleEntityClick = useCallback(
    (entityId: EntityId) => {
      if (subgraph) {
        const entitySubgraph = generateEntityRootedSubgraph(entityId, subgraph);

        if (!entitySubgraph) {
          throw new Error(
            `Could not find entity with id ${entityId} in subgraph`,
          );
        }

        setSelectedEntitySubgraph(entitySubgraph);
      }
    },
    [subgraph],
  );

  const createGetCellContent = useCallback(
    (entityRows: TypeEntitiesRow[]) =>
      ([colIndex, rowIndex]: Item):
        | TextIconCell
        | TextCell
        | BlankCell
        | CustomCell => {
        const columnId = columns[colIndex]?.id;
        if (columnId) {
          const row = entityRows[rowIndex];

          if (!row) {
            /**
             * This can occur when `createGetCellContent` is called
             * for a row that has just been filtered out, so we handle
             * this by briefly not displaying anything in the cell.
             */
            return {
              kind: GridCellKind.Text,
              allowOverlay: false,
              readonly: true,
              displayData: String("Not Found"),
              data: "Not Found",
            };
          }

          if (columnId === "entityLabel") {
            return {
              kind: GridCellKind.Custom,
              allowOverlay: false,
              readonly: true,
              copyData: row.entityLabel,
              cursor: "pointer",
              data: {
                kind: "text-icon-cell",
                icon: "bpAsterisk",
                value: row.entityLabel,
                onClick: () => {
                  if (isViewingPages) {
                    void router.push(
                      `/${row.web}/${extractEntityUuidFromEntityId(
                        row.entityId,
                      )}`,
                    );
                  } else {
                    handleEntityClick(row.entityId);
                  }
                },
              },
            };
          } else if (["web", "entityTypeVersion"].includes(columnId)) {
            const cellValue = row[columnId];
            const stringValue = String(cellValue);

            return {
              kind: GridCellKind.Custom,
              allowOverlay: false,
              readonly: true,
              cursor: "pointer",
              copyData: stringValue,
              data: {
                kind: "text-icon-cell",
                icon: null,
                value: stringValue,
                onClick: () => {
                  if (columnId === "web") {
                    void router.push(`/${cellValue}`);
                  } else {
                    setSelectedEntityTypeId(row.entityTypeId);
                  }
                },
              },
            };
          } else if (columnId === "archived") {
            const value = row.archived ? "Yes" : "No";
            return {
              kind: GridCellKind.Text,
              readonly: true,
              allowOverlay: false,
              displayData: String(value),
              data: value,
            };
          } else if (columnId === "lastEdited") {
            return {
              kind: GridCellKind.Text,
              readonly: true,
              allowOverlay: false,
              displayData: String(row.lastEdited),
              data: row.lastEdited,
            };
          } else if (columnId === "created") {
            return {
              kind: GridCellKind.Text,
              readonly: true,
              allowOverlay: false,
              displayData: String(row.created),
              data: row.lastEdited,
            };
          } else if (columnId === "lastEditedBy" || columnId === "createdBy") {
            const actor =
              columnId === "lastEditedBy" ? row.lastEditedBy : row.createdBy;

            if (actor === "loading") {
              return {
                kind: GridCellKind.Text,
                readonly: true,
                allowOverlay: false,
                displayData: "Loading...",
                data: "Loading...",
              };
            }

            const actorName = actor ? actor.displayName : undefined;

            const actorIcon = actor
              ? ((actor.kind === "machine"
                  ? isAiMachineActor(actor)
                    ? "wandMagicSparklesRegular"
                    : "hashSolid"
                  : "userRegular") satisfies CustomIcon)
              : undefined;

            return {
              kind: GridCellKind.Custom,
              readonly: true,
              allowOverlay: false,
              copyData: String(actorName),
              data: {
                kind: "chip-cell",
                chips: actorName
                  ? [
                      {
                        text: actorName,
                        icon: actorIcon,
                      },
                    ]
                  : [],
                color: "gray",
                variant: "filled",
              },
            };
          }

          const propertyCellValue = columnId && row[columnId];

          if (propertyCellValue) {
            return {
              kind: GridCellKind.Text,
              allowOverlay: true,
              readonly: true,
              displayData: String(propertyCellValue),
              data: propertyCellValue,
            };
          }
        }

        return blankCell;
      },
    [columns, handleEntityClick, router, isViewingPages],
  );

  const theme = useTheme();

  const webs = useMemo(
    () =>
      rows
        ?.map(({ web }) => web)
        .filter((web, index, all) => all.indexOf(web) === index) ?? [],
    [rows],
  );

  const [selectedWebs, setSelectedWebs] = useState<string[]>(webs);

  useEffect(() => {
    setSelectedWebs(webs);
  }, [webs]);

  const sortRows = useCallback<
    NonNullable<GridProps<TypeEntitiesRow>["sortRows"]>
  >((unsortedRows, sort, previousSort) => {
    return unsortedRows.toSorted((a, b) => {
      const isActorSort = ["lastEditedBy", "createdBy"].includes(
        sort.columnKey,
      );

      const value1: string = isActorSort
        ? a[sort.columnKey].displayName
        : String(a[sort.columnKey]);

      const value2: string = isActorSort
        ? b[sort.columnKey].displayName
        : String(b[sort.columnKey]);

      const previousSortWasActorSort =
        previousSort &&
        ["lastEditedBy", "createdBy"].includes(previousSort.columnKey);

      const previousValue1: string = previousSort?.columnKey
        ? previousSortWasActorSort
          ? a[previousSort.columnKey].displayName
          : String(a[previousSort.columnKey])
        : undefined;

      const previousValue2: string = previousSort?.columnKey
        ? previousSortWasActorSort
          ? b[previousSort.columnKey].displayName
          : String(b[previousSort.columnKey])
        : undefined;

      let comparison = value1.localeCompare(value2);

      if (comparison === 0 && previousValue1 && previousValue2) {
        // if the two keys are equal, we sort by the previous sort
        comparison = previousValue1.localeCompare(previousValue2);
      }

      if (sort.direction === "desc") {
        // reverse if descending
        comparison = -comparison;
      }

      return comparison;
    });
  }, []);

  const entityTypeVersions = useMemo(
    () =>
      rows
        ?.map(({ entityTypeVersion }) => entityTypeVersion)
        .filter(
          (entityTypeVersion, index, all) =>
            all.indexOf(entityTypeVersion) === index,
        ) ?? [],
    [rows],
  );

  const [selectedEntityTypeVersions, setSelectedEntityTypeVersions] =
    useState<string[]>(entityTypeVersions);

  useEffect(() => {
    setSelectedEntityTypeVersions(entityTypeVersions);
  }, [entityTypeVersions]);

  const [selectedArchivedStatus, setSelectedArchivedStatus] = useState<
    ("archived" | "not-archived")[]
  >(["archived", "not-archived"]);

  const { createdByActors, lastEditedByActors } = useMemo(() => {
    const lastEditedBySet = new Set<MinimalActor>();
    const createdBySet = new Set<MinimalActor>();
    for (const row of rows ?? []) {
      if (row.lastEditedBy && row.lastEditedBy !== "loading") {
        lastEditedBySet.add(row.lastEditedBy);
      }
      if (row.createdBy && row.createdBy !== "loading") {
        createdBySet.add(row.createdBy);
      }
    }
    return {
      lastEditedByActors: [...lastEditedBySet],
      createdByActors: [...createdBySet],
    };
  }, [rows]);

  const [selectedLastEditedByAccountIds, setSelectedLastEditedByAccountIds] =
    useState<string[]>(lastEditedByActors.map(({ accountId }) => accountId));

  const [selectedCreatedByAccountIds, setSelectedCreatedByAccountIds] =
    useState<string[]>(createdByActors.map(({ accountId }) => accountId));

  useEffect(() => {
    setSelectedLastEditedByAccountIds(
      lastEditedByActors.map(({ accountId }) => accountId),
    );
  }, [lastEditedByActors]);

  useEffect(() => {
    setSelectedCreatedByAccountIds(
      createdByActors.map(({ accountId }) => accountId),
    );
  }, [createdByActors]);

  const columnFilters = useMemo<ColumnFilter<string, TypeEntitiesRow>[]>(
    () => [
      {
        columnKey: "web",
        filterItems: webs.map((web) => ({
          id: web,
          label: web,
        })),
        selectedFilterItemIds: selectedWebs,
        setSelectedFilterItemIds: setSelectedWebs,
        isRowFiltered: (row) => !selectedWebs.includes(row.web),
      },
      {
        columnKey: "entityTypeVersion",
        filterItems: entityTypeVersions.map((entityTypeVersion) => ({
          id: entityTypeVersion,
          label: entityTypeVersion,
        })),
        selectedFilterItemIds: selectedEntityTypeVersions,
        setSelectedFilterItemIds: setSelectedEntityTypeVersions,
        isRowFiltered: (row) =>
          !selectedEntityTypeVersions.includes(row.entityTypeVersion),
      },
      {
        columnKey: "archived",
        filterItems: [
          {
            id: "archived",
            label: "Archived",
          },
          {
            id: "not-archived",
            label: "Not Archived",
          },
        ],
        selectedFilterItemIds: selectedArchivedStatus,
        setSelectedFilterItemIds: (filterItemIds) =>
          setSelectedArchivedStatus(
            filterItemIds as ("archived" | "not-archived")[],
          ),
        isRowFiltered: (row) =>
          row.archived
            ? !selectedArchivedStatus.includes("archived")
            : !selectedArchivedStatus.includes("not-archived"),
      },
      {
        columnKey: "lastEditedBy",
        filterItems: lastEditedByActors.map((actor) => ({
          id: actor.accountId,
          label: actor.displayName ?? "Unknown Actor",
        })),
        selectedFilterItemIds: selectedLastEditedByAccountIds,
        setSelectedFilterItemIds: setSelectedLastEditedByAccountIds,
        isRowFiltered: (row) =>
          row.lastEditedBy && row.lastEditedBy !== "loading"
            ? !selectedLastEditedByAccountIds.includes(
                row.lastEditedBy.accountId,
              )
            : false,
      },
      {
        columnKey: "createdBy",
        filterItems: createdByActors.map((actor) => ({
          id: actor.accountId,
          label: actor.displayName ?? "Unknown Actor",
        })),
        selectedFilterItemIds: selectedCreatedByAccountIds,
        setSelectedFilterItemIds: setSelectedCreatedByAccountIds,
        isRowFiltered: (row) =>
          row.createdBy && row.createdBy !== "loading"
            ? !selectedCreatedByAccountIds.includes(row.createdBy.accountId)
            : false,
      },
    ],
    [
      createdByActors,
      webs,
      selectedWebs,
      entityTypeVersions,
      selectedEntityTypeVersions,
      lastEditedByActors,
      selectedCreatedByAccountIds,
      selectedLastEditedByAccountIds,
      selectedArchivedStatus,
    ],
  );

  const currentlyDisplayedRowsRef = useRef<TypeEntitiesRow[] | null>(null);

  const { getEntitiesTableAdditionalCsvData } =
    useGetEntitiesTableAdditionalCsvData({
      currentlyDisplayedRowsRef,
      propertyTypes,
      /**
       * If the properties columns are hidden, we want to add
       * them to the CSV file.
       */
      addPropertiesColumns: hidePropertiesColumns,
    });

  const maximumTableHeight = `calc(100vh - (${
    HEADER_HEIGHT + TOP_CONTEXT_BAR_HEIGHT + 179 + tableHeaderHeight
  }px + ${theme.spacing(5)} + ${theme.spacing(5)}))`;

  const isPrimaryEntity = useCallback(
    (entity: Entity) =>
      entityTypeBaseUrl
        ? extractBaseUrl(entity.metadata.entityTypeId) === entityTypeBaseUrl
        : entityTypeId
          ? entityTypeId === entity.metadata.entityTypeId
          : false,
    [entityTypeId, entityTypeBaseUrl],
  );

  const filterEntity = useCallback(
    (entity: Entity) =>
      filterState.includeGlobal
        ? true
        : internalWebIds.includes(
            extractOwnedByIdFromEntityId(entity.metadata.recordId.entityId),
          ),
    [filterState, internalWebIds],
  );

  return (
    <>
      {selectedEntityTypeId && (
        <TypeSlideOverStack
          rootTypeId={selectedEntityTypeId}
          onClose={() => setSelectedEntityTypeId(null)}
        />
      )}
      {selectedEntitySubgraph ? (
        <EditEntitySlideOver
          open
          entitySubgraph={selectedEntitySubgraph}
          onClose={() => setSelectedEntitySubgraph(null)}
          readonly
          onSubmit={() => {
            throw new Error(`Editing not yet supported from this screen`);
          }}
        />
      ) : null}
      <Box>
        <TableHeader
          internalWebIds={internalWebIds}
          itemLabelPlural={isViewingPages ? "pages" : "entities"}
          items={entities}
          selectedItems={
            entities?.filter((entity) =>
              selectedRows.some(
                ({ entityId }) =>
                  entity.metadata.recordId.entityId === entityId,
              ),
            ) ?? []
          }
          title="Entities"
          columns={columns}
          currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
          getAdditionalCsvData={getEntitiesTableAdditionalCsvData}
          endAdornment={
            <TableHeaderToggle
              value={view}
              setValue={setView}
              options={(
                [
                  "Table",
                  ...(supportGridView ? (["Grid"] as const) : []),
                  "Graph",
                ] as const satisfies TableView[]
              ).map((optionValue) => ({
                icon: tableViewIcons[optionValue],
                label: `${optionValue} view`,
                value: optionValue,
              }))}
            />
          }
          filterState={filterState}
          setFilterState={setFilterState}
          toggleSearch={
            view === "Table" ? () => setShowSearch(true) : undefined
          }
          onBulkActionCompleted={() => setSelectedRows([])}
        />
        {view === "Graph" && subgraph ? (
          <Box height={maximumTableHeight}>
            <EntityGraphVisualizer
              entities={entities}
              isPrimaryEntity={isPrimaryEntity}
              filterEntity={filterEntity}
              onEntityClick={handleEntityClick}
              subgraphWithTypes={subgraph}
            />
          </Box>
        ) : view === "Grid" ? (
          <GridView entities={entities} />
        ) : (
          <Grid
            showSearch={showSearch}
            onSearchClose={() => setShowSearch(false)}
            columns={columns}
            columnFilters={columnFilters}
            dataLoading={loading}
            rows={rows}
            enableCheckboxSelection
            selectedRows={selectedRows}
            onSelectedRowsChange={(updatedSelectedRows) =>
              setSelectedRows(updatedSelectedRows)
            }
            sortRows={sortRows}
            firstColumnLeftPadding={16}
            height={`
               min(
                 ${maximumTableHeight},
                calc(
                 ${gridHeaderHeightWithBorder}px +
                 (${rows?.length ? rows.length : 1} * ${gridRowHeight}px) +
                 ${gridHorizontalScrollbarHeight}px)
               )`}
            createGetCellContent={createGetCellContent}
            customRenderers={[
              createRenderTextIconCell({ firstColumnLeftPadding: 16 }),
              renderChipCell,
            ]}
            freezeColumns={1}
            currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
          />
        )}
      </Box>
    </>
  );
};
