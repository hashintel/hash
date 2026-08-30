import { useRef } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { focusLands } from "../worksheet/focus-flow";
import { useFocusStops } from "../worksheet/use-focus-stops";
import { useSelectFirstActivation } from "../worksheet/use-select-first";

import type { FocusStop } from "../worksheet/use-focus-stops";
import type { CSSProperties, ReactNode } from "react";

type TableCellTone = "emphasis" | "subtle";

export type TableColumn<Row> = {
  id: string;
  header: ReactNode;
  render: (row: Row) => ReactNode;
  flex?: CSSProperties["flex"];
  minWidth?: CSSProperties["minWidth"];
  width?: CSSProperties["width"];
  tone?: TableCellTone;
};

type TableProps<Row> = {
  columns: readonly TableColumn<Row>[];
  emptyLabel: string;
  getRowId: (row: Row) => string;
  rows: readonly Row[];
  onRowSelect?: (row: Row) => void;
  selectedRowId?: string | null;
};

const tableStyle = css({
  display: "flex",
  flexDirection: "column",
  width: "full",
  backgroundColor: "neutral.s00",
});

const tableHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[24px]",
  minHeight: "[36px]",
  paddingX: "[20px]",
  paddingY: "[8px]",
  backgroundColor: "neutral.s10",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
  flexShrink: 0,
});

const tableBodyStyle = css({
  display: "flex",
  flexDirection: "column",
  width: "full",
});

const tableHeaderCellStyle = css({
  display: "flex",
  alignItems: "center",
  height: "full",
  overflow: "hidden",
  color: "neutral.s80",
  fontSize: "xs",
  fontWeight: "medium",
  lineHeight: "[12px]",
  minWidth: "[0]",
  whiteSpace: "nowrap",
});

const tableRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[24px]",
  minHeight: "[56px]",
  paddingX: "[20px]",
  paddingY: "[12px]",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
  transition: "[background-color 0.1s ease]",
  _hover: {
    backgroundColor: "neutral.s20",
  },
});

const selectedRowStyle = css({
  backgroundColor: "neutral.s05",
});

const selectableTableRowStyle = css({
  cursor: "pointer",
  outline: "none",
  // The select-first grammar needs the focused row visible for pointer users
  // too, so this shows on any focus, not only :focus-visible.
  _focus: {
    boxShadow: "[inset 0 0 0 2px {colors.neutral.a25}]",
  },
});

const tableCellStyle = css({
  display: "flex",
  alignItems: "center",
  minWidth: "[0]",
});

const tableCellTextStyle = css({
  minWidth: "[0]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[18px]",
});

const tableCellTextEmphasisStyle = css({
  color: "neutral.s120",
});

const tableCellTextSubtleStyle = css({
  color: "neutral.s80",
});

const tableEmptyStateStyle = css({
  flex: "1",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "neutral.s80",
  fontSize: "sm",
});

const getColumnStyle = <Row,>(column: TableColumn<Row>): CSSProperties => ({
  flex: column.flex ?? (column.width ? "0 0 auto" : "1 1 0"),
  minWidth: column.minWidth,
  width: column.width,
});

const renderCellContent = (
  content: ReactNode,
  tone: TableCellTone = "emphasis",
) => {
  if (typeof content === "string" || typeof content === "number") {
    return (
      <span
        className={cx(
          tableCellTextStyle,
          tone === "emphasis"
            ? tableCellTextEmphasisStyle
            : tableCellTextSubtleStyle,
        )}
      >
        {content}
      </span>
    );
  }

  return content;
};

/**
 * A read-only data table whose selectable rows follow the worksheet keyboard
 * flow: the table is one Tab stop (roving tabindex), ArrowUp/ArrowDown walk
 * the rows, and activation is select-first — the first click focuses a row,
 * a click on the focused row (or Enter/Space) calls `onRowSelect`. Without
 * `onRowSelect` the rows are inert.
 */
export function Table<Row>({
  columns,
  emptyLabel,
  getRowId,
  rows,
  onRowSelect,
  selectedRowId,
}: TableProps<Row>) {
  const targets = useRef<Map<string, HTMLElement>>(new Map());

  const stops: FocusStop[] = onRowSelect
    ? rows.map((row) => ({ id: getRowId(row), kind: "row" }))
    : [];
  const {
    onKeyDown: onStopsKeyDown,
    onFocusTarget,
    tabIndexFor,
    attach,
  } = useFocusStops({
    stops,
    columnCount: 1,
    focusTarget: (target) => focusLands(targets.current.get(target.stopId)),
  });
  const { onPointerDown, shouldActivate } = useSelectFirstActivation();

  if (rows.length === 0) {
    return <div className={tableEmptyStateStyle}>{emptyLabel}</div>;
  }

  return (
    <div
      ref={onRowSelect ? attach : undefined}
      aria-colcount={columns.length}
      aria-rowcount={rows.length + 1}
      className={tableStyle}
      role="table"
    >
      <div role="rowgroup">
        <div aria-rowindex={1} className={tableHeaderStyle} role="row">
          {columns.map((column, columnIndex) => (
            <span
              key={column.id}
              aria-colindex={columnIndex + 1}
              className={tableHeaderCellStyle}
              role="columnheader"
              style={getColumnStyle(column)}
            >
              {column.header}
            </span>
          ))}
        </div>
      </div>

      <div className={tableBodyStyle} role="rowgroup">
        {rows.map((row, rowIndex) => {
          const rowId = getRowId(row);
          const isSelected = rowId === selectedRowId;
          const cells = columns.map((column, columnIndex) => (
            <div
              key={column.id}
              aria-colindex={columnIndex + 1}
              className={tableCellStyle}
              role="cell"
              style={getColumnStyle(column)}
            >
              {renderCellContent(column.render(row), column.tone)}
            </div>
          ));

          return (
            <div
              key={rowId}
              ref={
                onRowSelect
                  ? (element) => {
                      if (element) {
                        targets.current.set(rowId, element);
                      } else {
                        targets.current.delete(rowId);
                      }
                    }
                  : undefined
              }
              aria-rowindex={rowIndex + 2}
              aria-selected={onRowSelect ? isSelected : undefined}
              className={cx(
                tableRowStyle,
                onRowSelect ? selectableTableRowStyle : undefined,
                isSelected ? selectedRowStyle : undefined,
              )}
              role="row"
              tabIndex={
                onRowSelect
                  ? tabIndexFor({ stopId: rowId, column: 0 })
                  : undefined
              }
              onFocus={
                onRowSelect
                  ? (event) => {
                      if (event.target === event.currentTarget) {
                        onFocusTarget({ stopId: rowId, column: 0 });
                      }
                    }
                  : undefined
              }
              onPointerDown={onRowSelect ? onPointerDown : undefined}
              onClick={
                onRowSelect
                  ? (event) => {
                      if (shouldActivate(event)) {
                        onRowSelect(row);
                      }
                    }
                  : undefined
              }
              onKeyDown={
                onRowSelect
                  ? (event) => {
                      if (event.target !== event.currentTarget) {
                        return;
                      }
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        onRowSelect(row);
                        return;
                      }
                      onStopsKeyDown({ stopId: rowId, column: 0 })(event);
                    }
                  : undefined
              }
            >
              {cells}
            </div>
          );
        })}
      </div>
    </div>
  );
}
