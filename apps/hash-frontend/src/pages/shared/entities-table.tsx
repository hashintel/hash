import {
  CustomCell,
  GridCellKind,
  Item,
  TextCell,
} from "@glideapps/glide-data-grid";
import { isPageEntityTypeId } from "@local/hash-isomorphic-utils/is-page-entity-type-id";
import { systemTypes } from "@local/hash-isomorphic-utils/ontology-types";
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

  const {
    entities: lastLoadedEntities,
    entityTypes,
    hadCachedContent,
    loading,
    propertyTypes,
    subgraph,
  } = useEntityTypeEntities();

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
      entities?.every(({ metadata: { entityTypeId } }) =>
        isPageEntityTypeId(entityTypeId),
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
            : entity.properties[
                extractBaseUrl(systemTypes.propertyType.archived.propertyTypeId)
              ] !== true),
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
        filterState={filterState}
        setFilterState={setFilterState}
        toggleSearch={() => setShowSearch(true)}
        onBulkActionCompleted={() => setSelectedRows([])}
      />
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
    </Box>
  );
};
