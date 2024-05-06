import * as React from "react";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import { TableVirtuoso, TableComponents } from "react-virtuoso";
import { Box } from "@mui/material";
import {
  ComponentPropsWithoutRef,
  forwardRef,
  ReactElement,
  useCallback,
} from "react";
import { flowSectionBorderRadius } from "./styles";

const VirtuosoTableComponents: TableComponents<VirtualizedTableRow<any>> = {
  Scroller: forwardRef<HTMLDivElement>(
    (props: ComponentPropsWithoutRef<"div">, ref) => (
      <TableContainer
        {...props}
        ref={ref}
        sx={{
          background: "white",
          borderRadius: flowSectionBorderRadius,
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
        borderRadius: flowSectionBorderRadius,
        borderSpacing: 0,
        "th, td": {
          padding: "5px 14px",
          borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
          borderRight: ({ palette }) => `1px solid ${palette.gray[20]}`,
          textAlign: "left",
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

export type VirtualizedTableColumn = {
  id: string;
  label: string;
  width: number | string;
};

const createHeaderContent = (columns: VirtualizedTableColumn[]) => {
  return (
    <TableRow>
      {columns.map((column) => (
        <TableCell
          key={column.id}
          variant="head"
          sx={({ palette }) => ({
            background: palette.common.white,
            fontWeight: 600,
            width: column.width,
            fontSize: 12,
          })}
        >
          {column.label}
        </TableCell>
      ))}
    </TableRow>
  );
};

type Data = Record<string, unknown>;

export type VirtualizedTableRow<D extends Data> = {
  id: string;
  data: D;
};

export type CreateVirtualizedRowContentFn<D extends Data> = (
  index: number,
  row: VirtualizedTableRow<D>,
) => ReactElement;

type VirtualizedTableProps<D extends Data> = {
  createRowContent: CreateVirtualizedRowContentFn<D>;
  columns?: VirtualizedTableColumn[];
  height: number | string;
  rows: VirtualizedTableRow<D>[];
};

export const VirtualizedTable = <D extends Data>({
  createRowContent,
  columns,
  height,
  rows,
}: VirtualizedTableProps<D>) => {
  const fixedHeaderContent = useCallback(
    () => (columns ? createHeaderContent(columns) : undefined),
    [columns],
  );

  return (
    <Box
      style={{ borderRadius: flowSectionBorderRadius, height, width: "100%" }}
    >
      <TableVirtuoso
        data={rows}
        components={VirtuosoTableComponents}
        fixedHeaderContent={fixedHeaderContent}
        increaseViewportBy={50}
        itemContent={createRowContent}
        style={{ height }}
      />
    </Box>
  );
};
