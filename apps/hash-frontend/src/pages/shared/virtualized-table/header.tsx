import { Stack, Typography } from "@mui/material";
// eslint-disable-next-line no-restricted-imports
import TableCell from "@mui/material/TableCell";
// eslint-disable-next-line no-restricted-imports
import TableRow from "@mui/material/TableRow";

import type { VirtualizedTableColumn } from "../virtualized-table";
import type {
  TableFilterProps,
  VirtualizedTableFiltersByFieldId,
} from "./header/filter";
import { FilterButton } from "./header/filter";
import type { TableSortProps, VirtualizedTableSort } from "./header/sort";
import { SortButton } from "./header/sort";

export const headerHeight = 43;

export type ColumnMetadata = Record<string, unknown>;

export const HeaderContent = <
  Sort extends VirtualizedTableSort,
  Filters extends VirtualizedTableFiltersByFieldId,
  Id extends string,
  M extends ColumnMetadata,
>({
  columns,
  fixedColumns,
  filters,
  setFilters,
  sort,
  setSort,
}: {
  columns: VirtualizedTableColumn<Id, M>[];
  fixedColumns?: number;
} & TableSortProps<Sort> &
  Partial<TableFilterProps<Filters>>) => {
  return (
    <TableRow>
      {columns.map((column, index) => {
        const isFixed = fixedColumns !== undefined && index < fixedColumns;

        let left = 0;
        for (let i = index - 1; i >= 0; i--) {
          left += columns[i]!.width as number;
        }

        return (
          <TableCell
            key={column.id}
            variant="head"
            sx={({ palette }) => ({
              background: palette.common.white,
              width: column.width,
              minWidth:
                typeof column.width === "number" ? column.width : undefined,
              maxWidth:
                typeof column.width === "number" ? column.width : undefined,
              ...(isFixed
                ? {
                    position: "sticky",
                    left,
                    zIndex: 1,
                  }
                : {}),
            })}
          >
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
            >
              <Typography
                sx={[
                  { fontSize: 14, fontWeight: 500 },
                  ...(Array.isArray(column.textSx)
                    ? column.textSx
                    : [column.textSx]),
                ]}
              >
                {column.label}
              </Typography>
              <Stack direction="row" alignItems="center">
                {filters && setFilters && (
                  <FilterButton
                    columnId={column.id}
                    filters={filters}
                    setFilters={setFilters}
                  />
                )}
                {column.sortable && (
                  <SortButton
                    columnId={column.id}
                    setSort={setSort}
                    sort={sort}
                  />
                )}
              </Stack>
            </Stack>
          </TableCell>
        );
      })}
    </TableRow>
  );
};
