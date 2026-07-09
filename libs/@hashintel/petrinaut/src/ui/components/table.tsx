import { Icon, type IconName, LoadingSpinner } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
} from "react";

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
  renderActions?: (row: Row) => ReactNode;
  selectedRowId?: string | null;
};

type TableStatusBadgeProps = {
  children: ReactNode;
  iconName?: IconName;
  loading?: boolean;
  tone?: "active" | "error" | "neutral";
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
  _focusVisible: {
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

const tableActionCellStyle = css({
  width: "[28px]",
  flexShrink: 0,
  display: "flex",
  justifyContent: "flex-end",
});

const tableEmptyStateStyle = css({
  flex: "1",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "neutral.s80",
  fontSize: "sm",
});

const tableStatusBadgeStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  height: "[20px]",
  paddingX: "1.5",
  borderRadius: "md",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[14px]",
  whiteSpace: "nowrap",
});

const tableStatusBadgeActiveStyle = css({
  backgroundColor: "blue.s30",
  color: "blue.s110",
});

const tableStatusBadgeNeutralStyle = css({
  backgroundColor: "neutral.s30",
  color: "neutral.s120",
});

const tableStatusBadgeErrorStyle = css({
  backgroundColor: "red.s30",
  color: "red.s110",
});

const tableStatusSpinnerStyle = css({
  width: "[12px]",
  height: "[12px]",
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

function handleSelectableRowKeyDown<Row>(
  event: KeyboardEvent<HTMLDivElement>,
  row: Row,
  onRowSelect: (row: Row) => void,
) {
  if (event.target !== event.currentTarget) {
    return;
  }

  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  onRowSelect(row);
}

function handleSelectableRowClick<Row>(
  event: MouseEvent<HTMLDivElement>,
  row: Row,
  onRowSelect: (row: Row) => void,
) {
  const target = event.target;

  if (
    target instanceof Element &&
    target.closest("[data-table-action-cell]") !== null
  ) {
    return;
  }

  onRowSelect(row);
}

export const TableStatusBadge = ({
  children,
  iconName,
  loading = false,
  tone = "neutral",
}: TableStatusBadgeProps) => (
  <span
    className={cx(
      tableStatusBadgeStyle,
      tone === "active"
        ? tableStatusBadgeActiveStyle
        : tone === "error"
          ? tableStatusBadgeErrorStyle
          : tableStatusBadgeNeutralStyle,
    )}
  >
    {loading ? (
      <LoadingSpinner
        className={tableStatusSpinnerStyle}
        size="xs"
        variant="bars"
      />
    ) : iconName ? (
      <Icon name={iconName} size="xs" />
    ) : null}
    {children}
  </span>
);

export function Table<Row>({
  columns,
  emptyLabel,
  getRowId,
  rows,
  onRowSelect,
  renderActions,
  selectedRowId,
}: TableProps<Row>) {
  if (rows.length === 0) {
    return <div className={tableEmptyStateStyle}>{emptyLabel}</div>;
  }

  const columnCount = columns.length + (renderActions ? 1 : 0);
  const actionColumnIndex = columns.length + 1;

  return (
    <div
      aria-colcount={columnCount}
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
          {renderActions ? (
            <span
              aria-colindex={actionColumnIndex}
              aria-label="Actions"
              className={tableActionCellStyle}
              role="columnheader"
            />
          ) : null}
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
              aria-rowindex={rowIndex + 2}
              aria-selected={onRowSelect ? isSelected : undefined}
              className={cx(
                tableRowStyle,
                onRowSelect ? selectableTableRowStyle : undefined,
                isSelected ? selectedRowStyle : undefined,
              )}
              role="row"
              tabIndex={onRowSelect ? 0 : undefined}
              onClick={
                onRowSelect
                  ? (event) => handleSelectableRowClick(event, row, onRowSelect)
                  : undefined
              }
              onKeyDown={
                onRowSelect
                  ? (event) =>
                      handleSelectableRowKeyDown(event, row, onRowSelect)
                  : undefined
              }
            >
              {cells}
              {renderActions ? (
                <div
                  aria-colindex={actionColumnIndex}
                  className={tableActionCellStyle}
                  data-table-action-cell=""
                  role="cell"
                >
                  {renderActions(row)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
