import {
  ArrowUpWideShortLightIcon,
  IconButton,
} from "@hashintel/design-system";
import type { SxProps, Theme } from "@mui/material";
import { Box, Stack, Typography } from "@mui/material";
/* eslint-disable no-restricted-imports */
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
/* eslint-enable no-restricted-imports */
import type { ComponentPropsWithoutRef, ReactElement } from "react";
import { forwardRef, useCallback, useMemo } from "react";
import type { TableComponents } from "react-virtuoso";
import { TableVirtuoso } from "react-virtuoso";

type Data = Record<string, unknown>;

export type VirtualizedTableRow<D extends Data> = {
  id: string;
  data: D;
};

export const defaultCellSx: SxProps<Theme> = {
  padding: "5px 14px",
  borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
  textAlign: "left",
};

const borderRadius = "10px";

export const headerHeight = 43;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const VirtuosoTableComponents: TableComponents<VirtualizedTableRow<any>> = {
  Scroller: forwardRef<HTMLDivElement>(
    (props: ComponentPropsWithoutRef<"div">, ref) => (
      <TableContainer
        {...props}
        ref={ref}
        sx={{
          background: "white",
          borderRadius,
          height: "100%",
          border: ({ palette }) => `1px solid ${palette.gray[20]}`,
        }}
      />
    ),
  ),
  Table: (props) => (
    <Table
      {...props}
      sx={{
        tableLayout: "fixed",
        borderCollapse: "separate",
        borderRadius,
        borderSpacing: 0,
        th: {
          ...defaultCellSx,
          height: headerHeight,
        },
      }}
    />
  ),
  TableHead: forwardRef((props: ComponentPropsWithoutRef<"thead">, ref) => (
    <TableHead ref={ref} {...props} />
  )),
  TableRow,
  TableBody: forwardRef<HTMLTableSectionElement>(
    (props: ComponentPropsWithoutRef<"tbody">, ref) => (
      <TableBody {...props} ref={ref} />
    ),
  ),
};

export type VirtualizedTableColumn<FieldId extends string = string> = {
  id: FieldId;
  label: string;
  sortable: boolean;
  width: number | string;
};

export type VirtualizedTableSort<Field extends string = string> = {
  field: Field;
  direction: "asc" | "desc";
};

type TableSortProps<Sort extends VirtualizedTableSort = VirtualizedTableSort> =
  {
    sort?: Sort;
    setSort: (sort: Sort) => void;
  };

const SortButton = <Sort extends VirtualizedTableSort>({
  columnId,
  sort,
  setSort,
}: { columnId: NonNullable<Sort["field"]> } & TableSortProps<Sort>) => {
  const isSorted = sort?.field === columnId;
  const isSortedAscending = isSorted && sort.direction === "asc";

  return (
    <IconButton
      onClick={() =>
        setSort({
          field: columnId,
          direction: isSortedAscending ? "desc" : "asc",
        } as Sort)
      }
    >
      <ArrowUpWideShortLightIcon
        sx={{
          fill: ({ palette }) =>
            isSorted ? palette.blue[70] : palette.gray[50],
          fontSize: 15,
          transform: isSortedAscending ? "rotate(180deg)" : "rotate(0deg)",
          transition: ({ transitions }) => transitions.create("transform"),
        }}
      />
    </IconButton>
  );
};

const HeaderContent = <Sort extends VirtualizedTableSort>({
  columns,
  sort,
  setSort,
}: { columns: VirtualizedTableColumn[] } & TableSortProps<Sort>) => {
  return (
    <TableRow>
      {columns.map((column) => {
        return (
          <TableCell
            key={column.id}
            variant="head"
            sx={({ palette }) => ({
              background: palette.common.white,
              width: column.width,
            })}
          >
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
            >
              <Typography sx={{ fontSize: 14, fontWeight: 500 }}>
                {column.label}
              </Typography>
              {column.sortable && (
                <SortButton
                  columnId={column.id}
                  setSort={setSort}
                  sort={sort}
                />
              )}
            </Stack>
          </TableCell>
        );
      })}
    </TableRow>
  );
};

export type CreateVirtualizedRowContentFn<D extends Data> = (
  index: number,
  row: VirtualizedTableRow<D>,
) => ReactElement;

type VirtualizedTableProps<D extends Data, S extends VirtualizedTableSort> = {
  /**
   * This function will be called many times when scrolling, ensure repeated calls do as little as possible
   * @see https://virtuoso.dev/#performance
   */
  createRowContent: CreateVirtualizedRowContentFn<D>;
  columns?: VirtualizedTableColumn[];
  EmptyPlaceholder?: () => ReactElement;
  rows: VirtualizedTableRow<D>[];
} & TableSortProps<S>;

const height = "100%";

export const VirtualizedTable = <
  D extends Data,
  S extends VirtualizedTableSort,
>({
  createRowContent,
  columns,
  EmptyPlaceholder,
  rows,
  sort,
  setSort,
}: VirtualizedTableProps<D, S>) => {
  const fixedHeaderContent = useCallback(
    () => (columns ? HeaderContent({ columns, sort, setSort }) : null),
    [columns, sort, setSort],
  );

  const components = useMemo(
    () => ({
      ...VirtuosoTableComponents,
      EmptyPlaceholder,
    }),
    [EmptyPlaceholder],
  );

  return (
    <Box style={{ borderRadius, height, width: "100%" }}>
      <TableVirtuoso
        data={rows}
        components={components}
        fixedHeaderContent={fixedHeaderContent}
        followOutput="smooth"
        increaseViewportBy={50}
        itemContent={createRowContent}
        style={{ height }}
      />
    </Box>
  );
};
