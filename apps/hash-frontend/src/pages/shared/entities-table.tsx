import {
  Entity as BpEntity,
  EntityRootType as BpEntityRootType,
  Subgraph as BpSubgraph,
  VersionedUrl,
} from "@blockprotocol/graph";
import {
  CustomCell,
  GridCellKind,
  Item,
  TextCell,
} from "@glideapps/glide-data-grid";
import { EntitiesGraphChart } from "@hashintel/block-design-system";
import { ListRegularIcon } from "@hashintel/design-system";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { isPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { PageProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  BaseUrl,
  Entity,
  EntityId,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import {
  Box,
  ToggleButton,
  toggleButtonClasses,
  ToggleButtonGroup,
  Tooltip,
  useTheme,
} from "@mui/material";
import { useRouter } from "next/router";
import {
  FunctionComponent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Grid,
  gridHeaderHeightWithBorder,
  gridHorizontalScrollbarHeight,
  gridRowHeight,
} from "../../components/grid/grid";
import { BlankCell, blankCell } from "../../components/grid/utils";
import { CustomIcon } from "../../components/grid/utils/custom-grid-icons";
import { ColumnFilter } from "../../components/grid/utils/filtering";
import { useGetOwnerForEntity } from "../../components/hooks/use-get-owner-for-entity";
import { useEntityTypeEntitiesContext } from "../../shared/entity-type-entities-context";
import { useEntityTypesContextRequired } from "../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { ChartNetworkRegularIcon } from "../../shared/icons/chart-network-regular-icon";
import { GridSolidIcon } from "../../shared/icons/grid-solid-icon";
import { HEADER_HEIGHT } from "../../shared/layout/layout-with-header/page-header";
import {
  FilterState,
  TableHeader,
  tableHeaderHeight,
} from "../../shared/table-header";
import { isAiMachineActor } from "../../shared/use-actors";
import { useEntityTypeEntities } from "../../shared/use-entity-type-entities";
import { useAuthenticatedUser } from "./auth-info-context";
import { renderChipCell } from "./chip-cell";
import { GridView } from "./entities-table/grid-view";
import {
  createRenderTextIconCell,
  TextIconCell,
} from "./entities-table/text-icon-cell";
import {
  TypeEntitiesRow,
  useEntitiesTable,
} from "./entities-table/use-entities-table";
import { useGetEntitiesTableAdditionalCsvData } from "./entities-table/use-get-entities-table-additional-csv-data";
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
) as BaseUrl[];

const entitiesTableViews = ["Table", "Graph", "Grid"] as const;

type EntityTableView = (typeof entitiesTableViews)[number];

const entitiesTableViewIcons: Record<EntityTableView, ReactNode> = {
  Table: <ListRegularIcon sx={{ fontSize: 18 }} />,
  Graph: <ChartNetworkRegularIcon sx={{ fontSize: 18 }} />,
  Grid: <GridSolidIcon sx={{ fontSize: 14 }} />,
};

export const EntitiesTable: FunctionComponent<{
  hideEntityTypeVersionColumn?: boolean;
  hidePropertiesColumns?: boolean;
}> = ({ hideEntityTypeVersionColumn, hidePropertiesColumns = false }) => {
  const router = useRouter();

  const { authenticatedUser } = useAuthenticatedUser();

  const [filterState, setFilterState] = useState<FilterState>({
    includeGlobal: false,
  });
  const [showSearch, setShowSearch] = useState<boolean>(false);

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
      entityTypes?.every(({ $id }) => isSpecialEntityTypeLookup?.[$id]?.isFile),
    [entityTypeBaseUrl, entityTypeId, entityTypes, isSpecialEntityTypeLookup],
  );

  const supportGridView = isDisplayingFilesOnly;

  const [view, setView] = useState<EntityTableView>(
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
      entities?.every(({ metadata }) =>
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
    hideEntityTypeVersionColumn,
    hidePropertiesColumns,
    isViewingPages,
  });

  const [selectedRows, setSelectedRows] = useState<TypeEntitiesRow[]>([]);

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
                onClick: () =>
                  router.push(
                    isViewingPages
                      ? `/${row.namespace}/${extractEntityUuidFromEntityId(
                          row.entityId,
                        )}`
                      : `/${
                          row.namespace
                        }/entities/${extractEntityUuidFromEntityId(
                          row.entityId,
                        )}`,
                  ),
              },
            };
          } else if (["namespace", "entityTypeVersion"].includes(columnId)) {
            const cellValue = row[columnId];
            return {
              kind: GridCellKind.Text,
              allowOverlay: true,
              readonly: true,
              displayData: String(cellValue),
              data: cellValue,
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
          } else if (columnId === "lastEditedBy") {
            const { lastEditedBy } = row;
            const lastEditedByName = lastEditedBy
              ? lastEditedBy.displayName
              : undefined;

            const lastEditedByIcon = lastEditedBy
              ? ((lastEditedBy.kind === "machine"
                  ? isAiMachineActor(lastEditedBy)
                    ? "wandMagicSparklesRegular"
                    : "hashSolid"
                  : "userRegular") satisfies CustomIcon)
              : undefined;

            return {
              kind: GridCellKind.Custom,
              readonly: true,
              allowOverlay: false,
              copyData: String(lastEditedByName),
              data: {
                kind: "chip-cell",
                chips: lastEditedByName
                  ? [
                      {
                        text: lastEditedByName,
                        icon: lastEditedByIcon,
                      },
                    ]
                  : [],
                color: "gray",
                variant: "filled",
              },
            };
          }

          const propertyCellValue =
            columnId && row.properties && row.properties[columnId];

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
    [columns, router, isViewingPages],
  );

  const theme = useTheme();

  const getOwnerForEntity = useGetOwnerForEntity();

  const handleEntityClick = useCallback(
    (entity: BpEntity) => {
      const { shortname: entityNamespace } = getOwnerForEntity(
        entity as Entity,
      );

      if (entityNamespace === "") {
        return;
      }

      void router.push(
        `/@${entityNamespace}/entities/${extractEntityUuidFromEntityId(
          entity.metadata.recordId.entityId as EntityId,
        )}`,
      );
    },
    [router, getOwnerForEntity],
  );

  const namespaces = useMemo(
    () =>
      rows
        ?.map(({ namespace }) => namespace)
        .filter((namespace, index, all) => all.indexOf(namespace) === index) ??
      [],
    [rows],
  );

  const [selectedNamespaces, setSelectedNamespaces] =
    useState<string[]>(namespaces);

  useEffect(() => {
    setSelectedNamespaces(namespaces);
  }, [namespaces]);

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

  const lastEditedByActors = useMemo(
    () =>
      rows
        ?.map(({ lastEditedBy }) => lastEditedBy ?? [])
        .flat()
        .filter(
          (actor, index, all) =>
            all.findIndex(({ accountId }) => accountId === actor.accountId) ===
            index,
        ) ?? [],
    [rows],
  );

  const [selectedLastEditedByAccountIds, setSelectedLastEditedByAccountIds] =
    useState<string[]>(lastEditedByActors.map(({ accountId }) => accountId));

  useEffect(() => {
    setSelectedLastEditedByAccountIds(
      lastEditedByActors.map(({ accountId }) => accountId),
    );
  }, [lastEditedByActors]);

  const columnFilters = useMemo<ColumnFilter<string, TypeEntitiesRow>[]>(
    () => [
      {
        columnKey: "namespace",
        filterItems: namespaces.map((namespace) => ({
          id: namespace,
          label: namespace,
        })),
        selectedFilterItemIds: selectedNamespaces,
        setSelectedFilterItemIds: setSelectedNamespaces,
        isRowFiltered: (row) => !selectedNamespaces.includes(row.namespace),
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
          row.lastEditedBy
            ? !selectedLastEditedByAccountIds.includes(
                row.lastEditedBy.accountId,
              )
            : false,
      },
    ],
    [
      namespaces,
      selectedNamespaces,
      entityTypeVersions,
      selectedEntityTypeVersions,
      lastEditedByActors,
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

  return (
    <Box>
      <TableHeader
        internalWebIds={internalWebIds}
        itemLabelPlural={isViewingPages ? "pages" : "entities"}
        items={entities}
        selectedItems={
          entities?.filter((entity) =>
            selectedRows.some(
              ({ entityId }) => entity.metadata.recordId.entityId === entityId,
            ),
          ) ?? []
        }
        title="Entities"
        columns={columns}
        currentlyDisplayedRowsRef={currentlyDisplayedRowsRef}
        getAdditionalCsvData={getEntitiesTableAdditionalCsvData}
        endAdornment={
          <ToggleButtonGroup
            value={view}
            exclusive
            onChange={(_, updatedView) => {
              if (updatedView) {
                setView(updatedView);
              }
            }}
            aria-label="view"
            size="small"
            sx={{
              [`.${toggleButtonClasses.root}`]: {
                backgroundColor: ({ palette }) => palette.common.white,
                "&:not(:last-of-type)": {
                  borderRightColor: ({ palette }) => palette.gray[20],
                  borderRightStyle: "solid",
                  borderRightWidth: 2,
                },
                "&:hover": {
                  backgroundColor: ({ palette }) => palette.common.white,
                  svg: {
                    color: ({ palette }) => palette.gray[80],
                  },
                },
                [`&.${toggleButtonClasses.selected}`]: {
                  backgroundColor: ({ palette }) => palette.common.white,
                  svg: {
                    color: ({ palette }) => palette.gray[90],
                  },
                },
                svg: {
                  transition: ({ transitions }) => transitions.create("color"),
                  color: ({ palette }) => palette.gray[50],
                },
              },
            }}
          >
            {(
              [
                "Table",
                ...(supportGridView ? (["Grid"] as const) : []),
                "Graph",
              ] satisfies EntityTableView[]
            ).map((viewName) => (
              <ToggleButton
                key={viewName}
                disableRipple
                value={viewName}
                aria-label={viewName}
              >
                <Tooltip title={`${viewName} view`} placement="top">
                  <Box sx={{ lineHeight: 0 }}>
                    {entitiesTableViewIcons[viewName]}
                  </Box>
                </Tooltip>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        }
        filterState={filterState}
        setFilterState={setFilterState}
        toggleSearch={view === "Table" ? () => setShowSearch(true) : undefined}
        onBulkActionCompleted={() => setSelectedRows([])}
      />
      {view === "Graph" ? (
        <EntitiesGraphChart
          isPrimaryEntity={(entity) =>
            entityTypeBaseUrl
              ? extractBaseUrl(entity.metadata.entityTypeId) ===
                entityTypeBaseUrl
              : entityTypeId
                ? entityTypeId === entity.metadata.entityTypeId
                : true
          }
          filterEntity={(entity) =>
            filterState.includeGlobal
              ? true
              : internalWebIds.includes(
                  extractOwnedByIdFromEntityId(
                    entity.metadata.recordId.entityId as EntityId,
                  ),
                )
          }
          onEntityClick={handleEntityClick}
          sx={{
            background: ({ palette }) => palette.common.white,
            height: `calc(100vh - (${
              HEADER_HEIGHT + TOP_CONTEXT_BAR_HEIGHT + 179 + tableHeaderHeight
            }px + ${theme.spacing(5)} + ${theme.spacing(5)}))`,
            borderBottomRightRadius: 6,
            borderBottomLeftRadius: 6,
          }}
          subgraph={subgraph as unknown as BpSubgraph<BpEntityRootType>}
        />
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
          firstColumnLeftPadding={16}
          height={`
               min(
                 calc(100vh - (${
                   HEADER_HEIGHT +
                   TOP_CONTEXT_BAR_HEIGHT +
                   179 +
                   tableHeaderHeight
                 }px + ${theme.spacing(5)} + ${theme.spacing(5)})),
                calc(
                 ${gridHeaderHeightWithBorder}px +
                 (${rows ? rows.length : 1} * ${gridRowHeight}px) +
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
  );
};
