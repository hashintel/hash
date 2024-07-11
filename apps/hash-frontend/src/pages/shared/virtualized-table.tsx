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

export const defaultCellSx: SxProps<Theme> = {
  padding: "5px 14px",
  borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
  textAlign: "left",
  whiteSpace: "nowrap",
};

const borderRadius = "10px";

export const headerHeight = 43;

export type VirtualizedTableRow<D extends Data> = {
  id: string;
  data: D;
};

type FieldId = string;

type ColumnMetadata = Record<string, unknown>;

export type VirtualizedTableColumn<
  F extends FieldId,
  M extends ColumnMetadata = Record<string, never>,
> = {
  id: F;
  metadata?: M;
  label: string;
  sortable: boolean;
  textSx?: SxProps<Theme>;
  width: number | string;
};

export type VirtualizedTableContext<
  F extends string,
  M extends ColumnMetadata = Record<string, never>,
> = { columns: VirtualizedTableColumn<F, M>[] };

const VirtuosoTableComponents: TableComponents<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  VirtualizedTableRow<any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  VirtualizedTableContext<any, any>
> = {
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

const HeaderContent = <
  Sort extends VirtualizedTableSort,
  F extends string,
  M extends ColumnMetadata,
>({
  columns,
  sort,
  setSort,
}: { columns: VirtualizedTableColumn<F, M>[] } & TableSortProps<Sort>) => {
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

export type CreateVirtualizedRowContentFn<
  D extends Data,
  F extends FieldId = string,
  M extends ColumnMetadata = Record<string, never>,
> = (
  index: number,
  row: VirtualizedTableRow<D>,
  context: VirtualizedTableContext<F, M>,
) => ReactElement;

type VirtualizedTableProps<
  D extends Data,
  S extends VirtualizedTableSort,
  F extends FieldId,
  M extends ColumnMetadata,
> = {
  /**
   * This function will be called many times when scrolling, ensure repeated calls do as little as possible
   * @see https://virtuoso.dev/#performance
   */
  createRowContent: CreateVirtualizedRowContentFn<D, F, M>;
  columns?: VirtualizedTableColumn<F, M>[];
  EmptyPlaceholder?: () => ReactElement;
  rows: VirtualizedTableRow<D>[];
} & TableSortProps<S>;

const height = "100%";

export const VirtualizedTable = <
  D extends Data,
  S extends VirtualizedTableSort,
  F extends FieldId,
  M extends ColumnMetadata,
>({
  createRowContent,
  columns,
  EmptyPlaceholder,
  rows,
  sort,
  setSort,
}: VirtualizedTableProps<D, S, F, M>) => {
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
        context={{ columns: columns ?? [] }}
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
