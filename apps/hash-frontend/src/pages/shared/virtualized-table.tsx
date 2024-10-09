import type { SxProps, Theme } from "@mui/material";
import { Box } from "@mui/material";
/* eslint-disable no-restricted-imports */
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
/* eslint-enable no-restricted-imports */
import type { ComponentPropsWithoutRef, ReactElement } from "react";
import { forwardRef, useCallback, useMemo } from "react";
import type { TableComponents } from "react-virtuoso";
import { TableVirtuoso } from "react-virtuoso";

import type { ColumnMetadata } from "./virtualized-table/header";
import {
  HeaderContent,
  virtualizedTableHeaderHeight,
} from "./virtualized-table/header";
import type {
  TableFilterProps,
  VirtualizedTableFilterDefinitionsByFieldId,
} from "./virtualized-table/header/filter";
import type {
  TableSortProps,
  VirtualizedTableSort,
} from "./virtualized-table/header/sort";

export const defaultCellSx = {
  padding: "5px 14px",
  borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
  textAlign: "left",
  whiteSpace: "nowrap",
} as const satisfies SxProps<Theme>;

const borderRadius = "10px";

type Data = Record<string, unknown>;

export type VirtualizedTableRow<D extends Data> = {
  id: string;
  data: D;
};

type FieldId = string;

export type VirtualizedTableColumn<
  Id extends FieldId,
  M extends ColumnMetadata = Record<string, never>,
> = {
  id: Id;
  metadata?: M;
  label: string;
  sortable: boolean;
  textSx?: SxProps<Theme>;
  width: number | string;
};

export type VirtualizedTableContext<
  Id extends string,
  M extends ColumnMetadata = Record<string, never>,
> = { columns: VirtualizedTableColumn<Id, M>[] };

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
          height: virtualizedTableHeaderHeight,
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

export type CreateVirtualizedRowContentFn<
  D extends Data,
  Id extends FieldId = string,
  M extends ColumnMetadata = Record<string, never>,
> = (
  index: number,
  row: VirtualizedTableRow<D>,
  context: VirtualizedTableContext<Id, M>,
) => ReactElement;

type VirtualizedTableProps<
  D extends Data,
  S extends VirtualizedTableSort,
  F extends VirtualizedTableFilterDefinitionsByFieldId,
  Id extends FieldId,
  M extends ColumnMetadata,
> = {
  /**
   * This function will be called many times when scrolling, ensure repeated calls do as little as possible
   * @see https://virtuoso.dev/#performance
   */
  createRowContent: CreateVirtualizedRowContentFn<D, Id, M>;
  columns?: VirtualizedTableColumn<Id, M>[];
  fixedColumns?: number;
  EmptyPlaceholder?: () => ReactElement;
  rows: VirtualizedTableRow<D>[];
} & TableSortProps<S> &
  Partial<TableFilterProps<F>>;

const heightStyle = { height: "100%" };

export const VirtualizedTable = <
  D extends Data,
  S extends VirtualizedTableSort,
  F extends VirtualizedTableFilterDefinitionsByFieldId,
  Id extends FieldId,
  M extends ColumnMetadata,
>({
  createRowContent,
  columns,
  fixedColumns,
  EmptyPlaceholder,
  rows,
  filterDefinitions,
  filterValues,
  setFilterValues,
  sort,
  setSort,
}: VirtualizedTableProps<D, S, F, Id, M>) => {
  const fixedHeaderContent = useCallback(
    () =>
      columns
        ? HeaderContent({
            columns,
            fixedColumns,
            filterDefinitions,
            filterValues,
            setFilterValues,
            sort,
            setSort,
          })
        : null,
    [
      columns,
      fixedColumns,
      filterDefinitions,
      filterValues,
      setFilterValues,
      sort,
      setSort,
    ],
  );

  const components = useMemo(
    () => ({
      ...VirtuosoTableComponents,
      EmptyPlaceholder,
    }),
    [EmptyPlaceholder],
  );

  const context = useMemo(() => ({ columns: columns ?? [] }), [columns]);

  return (
    <Box style={{ borderRadius, width: "100%", ...heightStyle }}>
      <TableVirtuoso
        context={context}
        data={rows}
        components={components}
        fixedHeaderContent={fixedHeaderContent}
        followOutput="smooth"
        increaseViewportBy={50}
        itemContent={createRowContent}
        overscan={{ main: 100, reverse: 100 }}
        style={heightStyle}
      />
    </Box>
  );
};
