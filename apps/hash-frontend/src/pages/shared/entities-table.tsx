import {
  Entity as BpEntity,
  EntityRootType as BpEntityRootType,
  Subgraph as BpSubgraph,
} from "@blockprotocol/graph";
import {
  CustomCell,
  GridCellKind,
  Item,
  TextCell,
} from "@glideapps/glide-data-grid";
import { EntitiesGraphChart } from "@hashintel/block-design-system";
import { isPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { PageProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
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
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Grid,
  gridHeaderHeightWithBorder,
  gridHorizontalScrollbarHeight,
  gridRowHeight,
} from "../../components/grid/grid";
import { BlankCell, blankCell } from "../../components/grid/utils";
import { useGetOwnerForEntity } from "../../components/hooks/use-get-owner-for-entity";
import { useEntityTypeEntitiesContext } from "../../shared/entity-type-entities-context";
import { ChartNetworkRegularIcon } from "../../shared/icons/chart-network-regular-icon";
import { ListRegularIcon } from "../../shared/icons/list-regular-icon";
import { HEADER_HEIGHT } from "../../shared/layout/layout-with-header/page-header";
import {
  FilterState,
  TableHeader,
  tableHeaderHeight,
} from "../../shared/table-header";
import { useEntityTypeEntities } from "../../shared/use-entity-type-entities";
import { useAuthenticatedUser } from "./auth-info-context";
import { renderChipCell } from "./chip-cell";
import {
  createRenderTextIconCell,
  TextIconCell,
} from "./entities-table/text-icon-cell";
import {
  TypeEntitiesRow,
  useEntitiesTable,
} from "./entities-table/use-entities-table";
import { TOP_CONTEXT_BAR_HEIGHT } from "./top-context-bar";

export const EntitiesTable: FunctionComponent<{
  hideEntityTypeVersionColumn?: boolean;
  hidePropertiesColumns?: boolean;
}> = ({ hideEntityTypeVersionColumn, hidePropertiesColumns }) => {
  const router = useRouter();

  const { authenticatedUser } = useAuthenticatedUser();

  const [filterState, setFilterState] = useState<FilterState>({
    includeGlobal: false,
  });
  const [showSearch, setShowSearch] = useState<boolean>(false);

  const [view, setView] = useState<"table" | "graph">("table");

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
            throw new Error("row not found");
          }

          if (columnId === "entity") {
            return {
              kind: GridCellKind.Custom,
              allowOverlay: false,
              readonly: true,
              copyData: row.entity,
              cursor: "pointer",
              data: {
                kind: "text-icon-cell",
                icon: "bpAsterisk",
                value: row.entity,
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
            const lastEditedBy = row.lastEditedBy?.preferredName;
            return {
              kind: GridCellKind.Custom,
              readonly: true,
              allowOverlay: false,
              copyData: String(lastEditedBy),
              data: {
                kind: "chip-cell",
                chips: lastEditedBy ? [{ text: lastEditedBy }] : [],
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
                  fontSize: 18,
                },
              },
            }}
          >
            <ToggleButton disableRipple value="table" aria-label="table">
              <Tooltip title="Table view" placement="top">
                <Box sx={{ lineHeight: 0 }}>
                  <ListRegularIcon />
                </Box>
              </Tooltip>
            </ToggleButton>
            <ToggleButton disableRipple value="graph" aria-label="graph">
              <Tooltip title="Graph view" placement="top">
                <Box sx={{ lineHeight: 0 }}>
                  <ChartNetworkRegularIcon />
                </Box>
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        }
        filterState={filterState}
        setFilterState={setFilterState}
        toggleSearch={view === "table" ? () => setShowSearch(true) : undefined}
        onBulkActionCompleted={() => setSelectedRows([])}
      />
      {view === "graph" ? (
        <EntitiesGraphChart
          primaryEntityTypeBaseUrl={
            entityTypeBaseUrl ??
            (entityTypeId ? extractBaseUrl(entityTypeId) : undefined)
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
      ) : (
        <Grid
          showSearch={showSearch}
          onSearchClose={() => setShowSearch(false)}
          columns={columns}
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
        />
      )}
    </Box>
  );
};
