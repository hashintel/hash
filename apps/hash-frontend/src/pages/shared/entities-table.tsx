import {
  CustomCell,
  GridCellKind,
  Item,
  TextCell,
} from "@glideapps/glide-data-grid";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { Entity, extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box } from "@mui/material";
import { useRouter } from "next/router";
import {
  FunctionComponent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Grid, GridProps } from "../../components/grid/grid";
import { BlankCell, blankCell } from "../../components/grid/utils";
import { FilterState, TableHeader } from "../../shared/table-header";
import { renderChipCell } from "../[shortname]/entities/[entity-uuid].page/entity-editor/properties-section/property-table/cells/chip-cell";
// todo: move this out
import { useEntityTypeEntities } from "../[shortname]/types/entity-type/[...slug-maybe-version].page/shared/entity-type-entities-context";
import {
  renderTextIconCell,
  TextIconCell,
} from "./entities-table/text-icon-cell";
import {
  TypeEntitiesRow,
  useEntitiesTable,
} from "./entities-table/use-entities-table";
import { WorkspaceContext } from "./workspace-context";

export const EntitiesTable: FunctionComponent<{
  hideEntityTypeVersionColumn?: boolean;
  hidePropertiesColumns?: boolean;
  height?: GridProps<Entity[]>["height"];
}> = ({ hideEntityTypeVersionColumn, hidePropertiesColumns, height }) => {
  const router = useRouter();

  const { activeWorkspaceAccountId } = useContext(WorkspaceContext);

  const [filterState, setFilterState] = useState<FilterState>({
    includeExternal: true,
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
          (filterState.includeExternal
            ? true
            : extractOwnedByIdFromEntityId(
                entity.metadata.recordId.entityId,
              ) === activeWorkspaceAccountId) &&
          (filterState.includeArchived === undefined ||
          filterState.includeArchived ||
          entity.metadata.entityTypeId !== types.entityType.page.entityTypeId
            ? true
            : entity.properties[
                extractBaseUrl(types.propertyType.archived.propertyTypeId)
              ] !== true),
      ),
    [entities, filterState, activeWorkspaceAccountId],
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
                      ? `/${row.namespace}/${row.entityId}`
                      : `/${row.namespace}/entities/${row.entityId}`,
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

  return (
    <Box>
      <TableHeader
        items={entities ?? []}
        filterState={filterState}
        setFilterState={setFilterState}
        toggleSearch={() => setShowSearch(true)}
      />
      <Grid
        showSearch={showSearch}
        onSearchClose={() => setShowSearch(false)}
        columns={columns ?? []}
        rows={rows ?? []}
        height={height}
        createGetCellContent={createGetCellContent}
        customRenderers={[renderTextIconCell, renderChipCell]}
      />
    </Box>
  );
};
