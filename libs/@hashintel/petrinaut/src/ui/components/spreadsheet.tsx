import { useRef, useState } from "react";
import { flushSync } from "react-dom";

import { css, cva } from "@hashintel/ds-helpers/css";
import {
  defaultTokenAttributeValue,
  formatUuid,
  toUuid,
  TYPE_POLICIES,
} from "@hashintel/petrinaut-core";

import { focusLands } from "../worksheet/focus-flow";
import { useFocusStops } from "../worksheet/use-focus-stops";
import { useRowSelection } from "../worksheet/use-row-selection";
import { useSelectFirstActivation } from "../worksheet/use-select-first";

import type { FocusStop, FocusStopTarget } from "../worksheet/use-focus-stops";

export interface SpreadsheetColumn {
  id: string;
  name: string;
  type?: "real" | "integer" | "boolean" | "uuid" | "string";
}

export type SpreadsheetCellValue = number | boolean | bigint | string;

export interface SpreadsheetProps {
  columns: SpreadsheetColumn[];
  data: SpreadsheetCellValue[][];
  onChange?: (data: SpreadsheetCellValue[][]) => void;
}

type CellPosition = {
  row: number;
  col: number;
};

const wrapperStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
});

const tableContainerStyle = css({
  position: "relative",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "sm",
  overflow: "auto",
  width: "[100%]",
  backgroundColor: "neutral.s10",
});

const tableStyle = css({
  width: "[100%]",
  borderCollapse: "collapse",
  fontSize: "xs",
  tableLayout: "fixed",
});

const rowNumberHeaderStyle = css({
  position: "sticky",
  top: "[0]",
  backgroundColor: "neutral.s15",
  borderBottom: "[1px solid {colors.neutral.bd.subtle}]",
  borderRight: "[1px solid {colors.neutral.bd.subtle}]",
  padding: "[4px 8px]",
  textAlign: "center",
  fontWeight: "medium",
  width: "[40px]",
  minWidth: "[40px]",
});

const columnHeaderStyle = css({
  position: "sticky",
  top: "[0]",
  backgroundColor: "neutral.s15",
  borderBottom: "[1px solid {colors.neutral.bd.subtle}]",
  padding: "[4px 8px]",
  textAlign: "left",
  fontWeight: "medium",
  fontFamily: "mono",
  minWidth: "[60px]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const rowStyle = cva({
  base: {
    height: "[28px]",
  },
  variants: {
    isSelected: {
      true: { backgroundColor: "blue.bg.min" },
      false: { backgroundColor: "neutral.s00" },
    },
    isSticky: {
      true: {
        position: "sticky",
        bottom: "[0]",
        zIndex: "[1]",
        backgroundColor: "neutral.s00",
        boxShadow: "[0 -1px 4px rgba(0, 0, 0, 0.1)]",
      },
    },
  },
});

const rowNumberCellStyle = cva({
  base: {
    borderRight: "[1px solid {colors.neutral.bd.subtle}]",
    borderBottom: "[1px solid {colors.neutral.a05}]",
    padding: "[4px 8px]",
    textAlign: "center",
    fontWeight: "medium",
    outline: "none",
  },
  variants: {
    isSelected: {
      true: { backgroundColor: "blue.bg.subtle" },
      false: { backgroundColor: "neutral.s10" },
    },
    isPhantom: {
      true: { color: "neutral.s70" },
      false: { color: "neutral.s105" },
    },
    isReadOnly: {
      true: { cursor: "default" },
      false: { cursor: "pointer" },
    },
  },
});

const cellContainerStyle = cva({
  base: {
    position: "relative",
    borderBottom: "[1px solid {colors.neutral.a05}]",
    padding: "0",
    height: "[28px]",
    "&:focus-within [data-uuid-overlay]": {
      display: "flex",
    },
  },
  variants: {
    isSticky: {
      true: {
        position: "sticky",
        bottom: "[0]",
        backgroundColor: "neutral.s00",
      },
    },
  },
});

const readOnlyCellStyle = css({
  height: "[28px]",
  display: "flex",
  alignItems: "center",
  fontFamily: "mono",
  fontSize: "xs",
  padding: "[4px 8px]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const editingInputStyle = css({
  width: "[100%]",
  height: "[28px]",
  border: "none",
  padding: "[4px 8px]",
  fontFamily: "mono",
  fontSize: "xs",
  backgroundColor: "blue.bg.min",
  outline: "[2px solid {colors.blue.s50}]",
  outlineOffset: "[-2px]",
  boxSizing: "border-box",
});

const cellButtonStyle = css({
  width: "[100%]",
  height: "[28px]",
  padding: "[4px 8px]",
  fontFamily: "mono",
  fontSize: "xs",
  backgroundColor: "[transparent]",
  outline: "none",
  outlineOffset: "[-2px]",
  cursor: "default",
  boxSizing: "border-box",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  display: "flex",
  alignItems: "center",
  _focus: {
    outline: "[2px solid {colors.blue.s50}]",
  },
});

const booleanCellStyle = css({
  margin: "0",
});

/**
 * Selected uuid cells expand to the full canonical string, spilling over the
 * neighbouring cells (spreadsheet-style overflow). Hidden until the cell
 * holds focus (revealed by the cell container's `:focus-within`); pointer
 * events pass through so clicks still reach the cell underneath. Cells in
 * the right half of the table spill leftwards so the overlay is not clipped
 * by the scroll container's edge.
 */
const uuidExpandedOverlayStyle = cva({
  base: {
    position: "absolute",
    top: "[0]",
    height: "[28px]",
    display: "none",
    alignItems: "center",
    padding: "[4px 8px]",
    fontFamily: "mono",
    fontSize: "xs",
    whiteSpace: "nowrap",
    width: "[max-content]",
    minWidth: "[100%]",
    // Opaque: the overlay covers neighbouring cell content while expanded.
    backgroundColor: "neutral.s00",
    outline: "[2px solid {colors.blue.s50}]",
    outlineOffset: "[-2px]",
    zIndex: "[2]",
    pointerEvents: "none",
  },
  variants: {
    anchor: {
      left: { left: "[0]" },
      right: { right: "[0]", justifyContent: "flex-end" },
    },
  },
});

const getDefaultCellValue = (
  column: SpreadsheetColumn | undefined,
): SpreadsheetCellValue =>
  column?.type ? defaultTokenAttributeValue(column.type) : 0;

const formatCellValue = (value: SpreadsheetCellValue): string => String(value);

const toCanonicalUuidString = (value: SpreadsheetCellValue): string =>
  formatUuid(typeof value === "bigint" ? value : toUuid(value));

/** Full-fidelity text used to prefill the cell editor. */
const getCellEditText = (
  column: SpreadsheetColumn | undefined,
  value: SpreadsheetCellValue,
): string =>
  column?.type === "uuid"
    ? toCanonicalUuidString(value)
    : formatCellValue(value);

/** Compact text shown in non-editing cells (uuids are truncated). */
const getCellDisplayText = (
  column: SpreadsheetColumn | undefined,
  value: SpreadsheetCellValue,
): string =>
  column?.type === "uuid"
    ? `${toCanonicalUuidString(value).slice(0, 8)}…`
    : formatCellValue(value);

/**
 * Hover tooltip — the full canonical uuid string for uuid cells, and the full
 * value for string cells (which may overflow with an ellipsis).
 */
const getCellTitle = (
  column: SpreadsheetColumn | undefined,
  value: SpreadsheetCellValue,
): string | undefined => {
  if (column?.type === "uuid") {
    return toCanonicalUuidString(value);
  }
  if (column?.type === "string") {
    return String(value);
  }
  return undefined;
};

/** Untyped columns parse like `real` (the per-type behaviour lives in core). */
const parseCellValue = (
  column: SpreadsheetColumn | undefined,
  rawValue: string,
): SpreadsheetCellValue =>
  TYPE_POLICIES[column?.type ?? "real"].parseEditorText(rawValue);

const targetKey = (target: FocusStopTarget): string =>
  `${target.stopId}:${target.column}`;

const handled = (event: React.KeyboardEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

const isTypingKey = (event: React.KeyboardEvent): boolean =>
  event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;

/**
 * An editable grid of typed cells with a row-number gutter and a sticky
 * phantom row that materializes on first edit. Fully controlled — the parent
 * owns `data` and receives edits via `onChange`.
 *
 * Movement, tab order, and the gutter lane come from the worksheet focus
 * layer: the grid is one tab stop (roving tabindex), arrows walk cells and
 * the gutter, and a move past an edge is offered to an enclosing
 * `FocusStack`, so sibling grids flow into each other. Clicks follow the
 * worksheet's select-first grammar: the first click selects a cell, a click
 * on the selected cell opens its editor.
 */
export const Spreadsheet: React.FC<SpreadsheetProps> = ({
  columns,
  data,
  onChange,
}) => {
  const isReadOnly = !onChange;
  const colCount = columns.length;

  const tableData = data.length > 0 ? data : [];

  const [editingCellState, setEditingCell] = useState<CellPosition | null>(
    null,
  );
  const [editingValue, setEditingValue] = useState<string>("");
  const targets = useRef<Map<string, HTMLElement>>(new Map());

  // Clamped against the current `data` so stale positions are masked rather
  // than synced via an effect.
  const editingCell =
    editingCellState && editingCellState.row <= tableData.length
      ? editingCellState
      : null;

  const createEmptyRow = (): SpreadsheetCellValue[] =>
    columns.map((column) => getDefaultCellValue(column));

  const displayRows = isReadOnly ? tableData : [...tableData, createEmptyRow()];

  const stops: FocusStop[] = displayRows.map((_, row) => ({
    id: String(row),
    kind: "row",
    gutter: true,
  }));

  const {
    onKeyDown: onStopsKeyDown,
    onFocusTarget,
    tabIndexFor,
    attach,
  } = useFocusStops({
    stops,
    columnCount: colCount,
    focusTarget: (target) => focusLands(targets.current.get(targetKey(target))),
  });
  const { selectedRow, setFocusedRow } = useRowSelection();
  const { onPointerDown, shouldActivate } = useSelectFirstActivation();

  const registerTarget =
    (target: FocusStopTarget) => (element: HTMLElement | null) => {
      if (element) {
        targets.current.set(targetKey(target), element);
      } else {
        targets.current.delete(targetKey(target));
      }
    };

  const focusCell = (row: number, column: number | "gutter"): boolean =>
    focusLands(targets.current.get(`${row}:${column}`));

  const updateCell = (
    row: number,
    col: number,
    value: SpreadsheetCellValue,
  ) => {
    let newData: SpreadsheetCellValue[][];

    // If editing the phantom row (last row), create a new actual row
    if (row === tableData.length) {
      newData = [...tableData, createEmptyRow()];
      if (newData[row]) {
        newData[row][col] = value;
      }
    } else {
      newData = tableData.map((rowData, index) =>
        index === row ? [...rowData] : rowData,
      );
      if (newData[row]) {
        newData[row][col] = value;
      }
    }

    onChange?.(newData);
  };

  const toggleBooleanCell = (row: number, col: number) => {
    const currentValue =
      tableData[row]?.[col] ?? getDefaultCellValue(columns[col]);
    // Truthiness, not `!== true`: a numerically-encoded 1 must toggle off
    // like `true` does.
    updateCell(row, col, !currentValue);
  };

  // The rows are index-keyed, so removal keeps the focused gutter element
  // mounted and focus lands on the row that slides into its place.
  const removeRow = (rowIndex: number) => {
    onChange?.(tableData.filter((_, index) => index !== rowIndex));
  };

  /** Open the editor synchronously so the mounted input can take focus. */
  const startEditing = (row: number, col: number, text: string) => {
    flushSync(() => {
      setEditingCell({ row, col });
      setEditingValue(text);
    });
    focusCell(row, col);
  };

  /** Commit synchronously so the display cells exist again before focusing. */
  const commitEdit = (row: number, col: number) => {
    flushSync(() => {
      updateCell(row, col, parseCellValue(columns[col], editingValue));
      setEditingCell(null);
      setEditingValue("");
    });
  };

  const onEditingKeyDown =
    (row: number, col: number): React.KeyboardEventHandler =>
    (event) => {
      if (event.key === "Enter") {
        handled(event);
        commitEdit(row, col);
        // Advance right, wrap to the next row's first cell, or stay put.
        if (
          !(col + 1 < colCount
            ? focusCell(row, col + 1)
            : focusCell(row + 1, 0))
        ) {
          focusCell(row, col);
        }
      } else if (event.key === "Escape") {
        handled(event);
        flushSync(() => {
          setEditingCell(null);
          setEditingValue("");
        });
        focusCell(row, col);
      }
    };

  const onCellKeyDown =
    (
      row: number,
      col: number,
      value: SpreadsheetCellValue,
    ): React.KeyboardEventHandler =>
    (event) => {
      if (event.key === "Enter") {
        handled(event);
        startEditing(row, col, getCellEditText(columns[col], value));
      } else if (event.key === "Delete" || event.key === "Backspace") {
        handled(event);
        updateCell(row, col, getDefaultCellValue(columns[col]));
        startEditing(row, col, "");
      } else if (isTypingKey(event)) {
        handled(event);
        startEditing(row, col, event.key);
      } else {
        onStopsKeyDown({ stopId: String(row), column: col })(event);
      }
    };

  const onBooleanCellKeyDown =
    (row: number, col: number): React.KeyboardEventHandler =>
    (event) => {
      const normalizedKey = event.key.toLowerCase();
      if (event.key === "Enter" || event.key === " ") {
        handled(event);
        toggleBooleanCell(row, col);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        handled(event);
        updateCell(row, col, false);
      } else if (
        isTypingKey(event) &&
        (normalizedKey === "t" || normalizedKey === "1")
      ) {
        handled(event);
        updateCell(row, col, true);
      } else if (
        isTypingKey(event) &&
        (normalizedKey === "f" || normalizedKey === "0")
      ) {
        handled(event);
        updateCell(row, col, false);
      } else if (isTypingKey(event)) {
        // Swallow any other printable key — boolean cells never open the
        // text editor (but keep shortcuts like Cmd+C working).
        handled(event);
      } else {
        onStopsKeyDown({ stopId: String(row), column: col })(event);
      }
    };

  const onGutterKeyDown =
    (row: number): React.KeyboardEventHandler =>
    (event) => {
      if (event.key === "Delete" || event.key === "Backspace") {
        handled(event);
        if (row < tableData.length) {
          removeRow(row);
        }
      } else if (event.key === "Enter") {
        handled(event);
        focusCell(row, 0);
      } else {
        onStopsKeyDown({ stopId: String(row), column: "gutter" })(event);
      }
    };

  const columnWidth = Math.max(60, 100 / colCount);

  return (
    <div className={wrapperStyle}>
      <div
        ref={attach}
        className={tableContainerStyle}
        style={{ flex: 1, minHeight: 0 }}
      >
        <table
          className={tableStyle}
          role="grid"
          aria-readonly={isReadOnly || undefined}
        >
          <thead>
            <tr>
              <th aria-label="Row number" className={rowNumberHeaderStyle} />
              {columns.map((column) => (
                <th
                  key={column.id}
                  className={columnHeaderStyle}
                  style={{
                    width: `${columnWidth}%`,
                    maxWidth: `${columnWidth}%`,
                  }}
                >
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, rowIndex) => {
              const isPhantomRow = !isReadOnly && rowIndex === tableData.length;
              const stopId = String(rowIndex);
              return (
                <tr
                  // eslint-disable-next-line react/no-array-index-key -- Row position is stable and meaningful; cell contents must stay out of the key (string cells are arbitrary-length, and value changes should update the row, not remount it)
                  key={`row-${rowIndex}`}
                  role="row"
                  className={rowStyle({
                    isSelected: selectedRow === rowIndex,
                    isSticky: isPhantomRow,
                  })}
                >
                  <td
                    role="rowheader"
                    ref={
                      isReadOnly
                        ? undefined
                        : registerTarget({ stopId, column: "gutter" })
                    }
                    tabIndex={
                      isReadOnly
                        ? undefined
                        : tabIndexFor({ stopId, column: "gutter" })
                    }
                    onKeyDown={
                      isReadOnly ? undefined : onGutterKeyDown(rowIndex)
                    }
                    onFocus={
                      isReadOnly
                        ? undefined
                        : () => {
                            onFocusTarget({ stopId, column: "gutter" });
                            setFocusedRow(rowIndex);
                          }
                    }
                    onBlur={isReadOnly ? undefined : () => setFocusedRow(null)}
                    className={rowNumberCellStyle({
                      isSelected: selectedRow === rowIndex,
                      isPhantom: rowIndex === tableData.length,
                      isReadOnly,
                    })}
                  >
                    {rowIndex === tableData.length ? "" : rowIndex + 1}
                  </td>
                  {row.map((value, colIndex) => {
                    const isEditing =
                      editingCell?.row === rowIndex &&
                      editingCell.col === colIndex;
                    const target: FocusStopTarget = {
                      stopId,
                      column: colIndex,
                    };
                    return (
                      <td
                        // eslint-disable-next-line react/no-array-index-key -- Column position is stable and meaningful
                        key={`cell-${rowIndex}-${colIndex}`}
                        role="gridcell"
                        className={cellContainerStyle({
                          isSticky: isPhantomRow,
                        })}
                        style={{ width: `${columnWidth}%` }}
                      >
                        {isReadOnly ? (
                          <div
                            className={readOnlyCellStyle}
                            title={getCellTitle(columns[colIndex], value)}
                            aria-label={getCellTitle(columns[colIndex], value)}
                          >
                            {getCellDisplayText(columns[colIndex], value)}
                          </div>
                        ) : isEditing ? (
                          <input
                            ref={registerTarget(target)}
                            type={
                              columns[colIndex]?.type === "uuid" ||
                              columns[colIndex]?.type === "string"
                                ? "text"
                                : "number"
                            }
                            step={
                              columns[colIndex]?.type === "uuid" ||
                              columns[colIndex]?.type === "string"
                                ? undefined
                                : columns[colIndex]?.type === "integer"
                                  ? 1
                                  : "any"
                            }
                            value={editingValue}
                            onChange={(event) =>
                              setEditingValue(event.target.value)
                            }
                            onKeyDown={onEditingKeyDown(rowIndex, colIndex)}
                            onBlur={() => {
                              updateCell(
                                rowIndex,
                                colIndex,
                                parseCellValue(columns[colIndex], editingValue),
                              );
                              setEditingCell(null);
                              setEditingValue("");
                            }}
                            className={editingInputStyle}
                          />
                        ) : columns[colIndex]?.type === "boolean" ? (
                          <div
                            ref={registerTarget(target)}
                            role="checkbox"
                            aria-checked={Boolean(value)}
                            aria-label={columns[colIndex].name}
                            tabIndex={tabIndexFor(target)}
                            onFocus={() => onFocusTarget(target)}
                            onKeyDown={onBooleanCellKeyDown(rowIndex, colIndex)}
                            onClick={() =>
                              toggleBooleanCell(rowIndex, colIndex)
                            }
                            className={cellButtonStyle}
                          >
                            {/* Visual only — the wrapping div owns the
                                checkbox role, so hide this from AT to
                                avoid double announcement. */}
                            <input
                              type="checkbox"
                              checked={Boolean(value)}
                              readOnly
                              tabIndex={-1}
                              aria-hidden
                              className={booleanCellStyle}
                            />
                          </div>
                        ) : (
                          <div
                            ref={registerTarget(target)}
                            role="button"
                            tabIndex={tabIndexFor(target)}
                            onFocus={() => onFocusTarget(target)}
                            onKeyDown={onCellKeyDown(rowIndex, colIndex, value)}
                            onPointerDown={onPointerDown}
                            onClick={(event) => {
                              if (shouldActivate(event)) {
                                startEditing(
                                  rowIndex,
                                  colIndex,
                                  getCellEditText(columns[colIndex], value),
                                );
                              }
                            }}
                            className={cellButtonStyle}
                            title={
                              isPhantomRow
                                ? undefined
                                : getCellTitle(columns[colIndex], value)
                            }
                            // Screen readers announce the truncated text;
                            // uuid cells need the full canonical string.
                            aria-label={
                              isPhantomRow
                                ? undefined
                                : getCellTitle(columns[colIndex], value)
                            }
                          >
                            {isPhantomRow
                              ? ""
                              : getCellDisplayText(columns[colIndex], value)}
                          </div>
                        )}
                        {!isReadOnly &&
                        !isEditing &&
                        !isPhantomRow &&
                        columns[colIndex]?.type === "uuid" ? (
                          <span
                            data-uuid-overlay
                            className={uuidExpandedOverlayStyle({
                              anchor:
                                colIndex >= colCount / 2 ? "right" : "left",
                            })}
                            aria-hidden
                          >
                            {toCanonicalUuidString(value)}
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
