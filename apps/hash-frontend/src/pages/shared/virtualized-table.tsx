import { Box, CircularProgress } from "@mui/material";
/* eslint-disable no-restricted-imports */
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
/* eslint-enable no-restricted-imports */
import { forwardRef, useCallback, useMemo } from "react";
import { TableVirtuoso } from "react-virtuoso";

import {
  HeaderContent,
  virtualizedTableHeaderHeight,
} from "./virtualized-table/header";

import type { ColumnMetadata } from "./virtualized-table/header";
import type { TableFilterProps } from "./virtualized-table/header/filter";
import type {
  TableSortProps,
  VirtualizedTableSort,
} from "./virtualized-table/header/sort";
import type { SxProps, Theme } from "@mui/material";
import type { ComponentPropsWithoutRef, ReactElement } from "react";
import type { FollowOutput, ListRange, TableComponents } from "react-virtuoso";

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
  Id extends FieldId,
  M extends ColumnMetadata,
  FilteredIds extends FieldId,
> = {
  /**
   * This function will be called many times when scrolling, ensure repeated calls do as little as possible
   * @see https://virtuoso.dev/#performance
   */
  createRowContent: CreateVirtualizedRowContentFn<D, Id, M>;
  columns?: VirtualizedTableColumn<Id, M>[];
  fixedColumns?: number;
  EmptyPlaceholder?: () => ReactElement;
  /**
   * Called when the user scrolls to the end of the loaded rows, for fetching
   * the next page of data.
   */
  onEndReached?: () => void;
  /**
   * Called when the visible row range changes. Useful for triggering paged
   * loading before the very end of the data is reached (e.g. when the scroll
   * content is padded with placeholder rows up to a known total count).
   */
  onRangeChange?: (range: ListRange) => void;
  /**
   * Called when the user starts (`true`) or stops (`false`) scrolling. Useful
   * for gating paged loading to deliberate user scrolls.
   */
  onIsScrolling?: (isScrolling: boolean) => void;
  /**
   * Auto-scroll behaviour when new rows are appended to the end. Defaults to
   * `"smooth"`. Set to `false` for paged tables, where appending a page should
   * not pull the viewport down to the new bottom.
   */
  followOutput?: FollowOutput;
  /**
   * Whether a further page is currently being fetched – shows a loading
   * indicator at the foot of the table.
   */
  loadingMore?: boolean;
  /**
   * When all rows are the same known height, set this so virtuoso uses it
   * directly instead of measuring each row. This avoids the scroll position
   * recalculating (and jumping) when placeholder rows are swapped for loaded
   * data of a slightly different measured height.
   */
  fixedItemHeight?: number;
  rows: VirtualizedTableRow<D>[];
} & TableSortProps<S> &
  Partial<TableFilterProps<FilteredIds>>;

const heightStyle = { height: "100%" };

export const VirtualizedTable = <
  D extends Data,
  Sort extends VirtualizedTableSort,
  Id extends FieldId,
  Metadata extends ColumnMetadata,
  FilteredIds extends Id,
>({
  createRowContent,
  columns,
  fixedColumns,
  EmptyPlaceholder,
  onEndReached,
  onRangeChange,
  onIsScrolling,
  followOutput = "smooth",
  loadingMore,
  fixedItemHeight,
  rows,
  filterDefinitions,
  filterValues,
  setFilterValues,
  sort,
  setSort,
}: VirtualizedTableProps<D, Sort, Id, Metadata, FilteredIds>) => {
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

  const fixedFooterContent = useMemo(() => {
    if (!loadingMore) {
      return undefined;
    }

    return () => (
      <tr>
        <td
          colSpan={columns?.length ?? 1}
          style={{ padding: "8px 14px", textAlign: "center" }}
        >
          <CircularProgress size={16} />
        </td>
      </tr>
    );
  }, [columns?.length, loadingMore]);

  return (
    <Box style={{ borderRadius, width: "100%", ...heightStyle }}>
      <TableVirtuoso
        context={context}
        data={rows}
        components={components}
        endReached={onEndReached}
        rangeChanged={onRangeChange}
        isScrolling={onIsScrolling}
        fixedItemHeight={fixedItemHeight}
        fixedFooterContent={fixedFooterContent}
        fixedHeaderContent={fixedHeaderContent}
        followOutput={followOutput}
        increaseViewportBy={50}
        itemContent={createRowContent}
        overscan={{ main: 200, reverse: 200 }}
        style={heightStyle}
      />
    </Box>
  );
};
