import { Icon, type IconName, LoadingSpinner } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
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

const tableRowButtonStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[24px]",
  alignSelf: "stretch",
  flex: "1",
  minWidth: "[0]",
  cursor: "pointer",
  background: "[none]",
  border: "[none]",
  paddingY: "[12px]",
  textAlign: "left",
});

const tableRowCellsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[24px]",
  flex: "1",
  minWidth: "[0]",
  paddingY: "[12px]",
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

  return (
    <div className={tableStyle} role="table">
      <div className={tableHeaderStyle} role="row">
        {columns.map((column) => (
          <span
            key={column.id}
            className={tableHeaderCellStyle}
            style={getColumnStyle(column)}
          >
            {column.header}
          </span>
        ))}
        {renderActions ? <span className={tableActionCellStyle} /> : null}
      </div>

      {rows.map((row) => {
        const rowId = getRowId(row);
        const cells = columns.map((column) => (
          <div
            key={column.id}
            className={tableCellStyle}
            style={getColumnStyle(column)}
          >
            {renderCellContent(column.render(row), column.tone)}
          </div>
        ));

        return (
          <div
            key={rowId}
            className={cx(
              tableRowStyle,
              rowId === selectedRowId ? selectedRowStyle : undefined,
            )}
            role="row"
          >
            {onRowSelect ? (
              <button
                type="button"
                className={tableRowButtonStyle}
                onClick={() => onRowSelect(row)}
              >
                {cells}
              </button>
            ) : (
              <div className={tableRowCellsStyle}>{cells}</div>
            )}
            {renderActions ? (
              <div className={tableActionCellStyle}>{renderActions(row)}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
