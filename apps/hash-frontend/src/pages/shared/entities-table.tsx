import { GridCellKind, Item, TextCell } from "@glideapps/glide-data-grid";
import { Box } from "@mui/material";
import { useRouter } from "next/router";
import { FunctionComponent, useCallback, useState } from "react";

import { Grid } from "../../components/grid/grid";
import { BlankCell, blankCell } from "../../components/grid/utils";
import { FilterState, TableHeader } from "../../shared/table-header";
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

export const EntitiesTable: FunctionComponent = () => {
  const router = useRouter();

  const [filterState, setFilterState] = useState<FilterState>({
    includeExternal: true,
  });
  const [showSearch, setShowSearch] = useState<boolean>(false);

  const { entities, entityTypes, propertyTypes, subgraph } =
    useEntityTypeEntities();

  const { columns, rows } =
    useEntitiesTable(entities, entityTypes, propertyTypes, subgraph) ?? {};

  const createGetCellContent = useCallback(
    (entityRows: TypeEntitiesRow[]) =>
      ([colIndex, rowIndex]: Item): TextIconCell | TextCell | BlankCell => {
        if (columns) {
          const row = entityRows[rowIndex];
          const columnId = columns[colIndex]?.id;
          const cellValue = columnId && row?.[columnId];

          if (cellValue) {
            if (columnId === "entity") {
              return {
                kind: GridCellKind.Custom,
                allowOverlay: false,
                readonly: true,
                copyData: cellValue,
                cursor: "pointer",
                data: {
                  kind: "text-icon-cell",
                  icon: "bpAsterisk",
                  value: cellValue,
                  onClick: () =>
                    router.push(`/${row.namespace}/entities/${row.entityId}`),
                },
              };
            }

            return {
              kind: GridCellKind.Text,
              allowOverlay: true,
              readonly: true,
              displayData: String(cellValue),
              data: cellValue,
            };
          }
        }

        return blankCell;
      },
    [columns, router],
  );

  return (
    <Box>
      <TableHeader
        items={entities ?? []}
        filterState={filterState}
        setFilterState={setFilterState}
      />
      <Grid
        showSearch={showSearch}
        onSearchClose={() => setShowSearch(false)}
        columns={columns ?? []}
        rows={rows ?? []}
        createGetCellContent={createGetCellContent}
        customRenderers={[renderTextIconCell]}
      />
    </Box>
  );
};
