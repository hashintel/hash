import {
  CustomCell,
  GridCellKind,
  Item,
  TextCell,
} from "@glideapps/glide-data-grid";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box, useTheme } from "@mui/material";
import { useRouter } from "next/router";
import {
  FunctionComponent,
  useCallback,
  useContext,
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
import { useEntityTypeEntities } from "../../shared/entity-type-entities-context";
import { HEADER_HEIGHT } from "../../shared/layout/layout-with-header/page-header";
import {
  FilterState,
  TableHeader,
  tableHeaderHeight,
} from "../../shared/table-header";
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
import { WorkspaceContext } from "./workspace-context";

export const EntitiesTable: FunctionComponent<{
  hideEntityTypeVersionColumn?: boolean;
  hidePropertiesColumns?: boolean;
}> = ({ hideEntityTypeVersionColumn, hidePropertiesColumns }) => {
  const router = useRouter();

  const { activeWorkspaceOwnedById } = useContext(WorkspaceContext);

  const [filterState, setFilterState] = useState<FilterState>({
    includeGlobal: false,
  });
  const [showSearch, setShowSearch] = useState<boolean>(false);

  const { entities, entityTypes, propertyTypes, subgraph } =
    useEntityTypeEntities();

  const isViewingPages = useMemo(
    () =>
      entities?.every(
        ({ metadata: { entityTypeId } }) =>
          entityTypeId === types.entityType.page.entityTypeId,
      ),
    [entities],
  );

  useEffect(() => {
    if (isViewingPages && filterState.includeArchived === undefined) {
      setFilterState((prev) => ({ ...prev, includeArchived: false }));
    }
  }, [isViewingPages, filterState]);

  const filteredEntities = useMemo(
    () =>
      entities?.filter(
        (entity) =>
          (filterState.includeGlobal
            ? true
            : extractOwnedByIdFromEntityId(
                entity.metadata.recordId.entityId,
              ) === activeWorkspaceOwnedById) &&
          (filterState.includeArchived === undefined ||
          filterState.includeArchived ||
          entity.metadata.entityTypeId !== types.entityType.page.entityTypeId
            ? true
            : entity.properties[
                extractBaseUrl(types.propertyType.archived.propertyTypeId)
              ] !== true),
      ),
    [entities, filterState, activeWorkspaceOwnedById],
  );

  const { columns, rows } =
    useEntitiesTable({
      entities: filteredEntities,
      entityTypes,
      propertyTypes,
      subgraph,
      hideEntityTypeVersionColumn,
      hidePropertiesColumns,
      isViewingPages,
    }) ?? {};

  const [selectedRows, setSelectedRows] = useState<TypeEntitiesRow[]>([]);

  const createGetCellContent = useCallback(
    (entityRows: TypeEntitiesRow[]) =>
      ([colIndex, rowIndex]: Item):
        | TextIconCell
        | TextCell
        | BlankCell
        | CustomCell => {
        const columnId = columns?.[colIndex]?.id;
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

  return (
    <Box>
      <TableHeader
        items={entities ?? []}
        selectedItems={
          entities?.filter((entity) =>
            selectedRows.some(
              ({ entityId }) => entity.metadata.recordId.entityId === entityId,
            ),
          ) ?? []
        }
        filterState={filterState}
        setFilterState={setFilterState}
        toggleSearch={() => setShowSearch(true)}
        onBulkActionCompleted={() => setSelectedRows([])}
      />
      {columns && rows ? (
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
                HEADER_HEIGHT + TOP_CONTEXT_BAR_HEIGHT + 179 + tableHeaderHeight
              }px + ${theme.spacing(5)} + ${theme.spacing(5)})),
             calc(
              ${gridHeaderHeightWithBorder}px +
              (${rows.length} * ${gridRowHeight}px) +
              ${gridHorizontalScrollbarHeight}px)
            )`}
          createGetCellContent={createGetCellContent}
          customRenderers={[
            createRenderTextIconCell({ firstColumnLeftPadding: 16 }),
            renderChipCell,
          ]}
          freezeColumns={1}
        />
      ) : null}
    </Box>
  );
};
