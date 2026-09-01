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
  /** Omit for a read-only grid. */
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
  flex: "1",
  minHeight: "[0]",
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
 * A focused uuid cell shows its full string in an overlay that spills over
 * the neighbouring cells, revealed by the container's `:focus-within`.
 * Pointer events pass through to the cell underneath. Cells in the right
 * half spill leftwards so the scroll container does not clip the overlay.
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

const toCanonicalUuidString = (value: SpreadsheetCellValue): string =>
  formatUuid(typeof value === "bigint" ? value : toUuid(value));

/** Columns edited as free text, and whose full value shows in a tooltip. */
const isTextColumn = (column: SpreadsheetColumn | undefined): boolean =>
  column?.type === "uuid" || column?.type === "string";

/** The full value: the editor's initial text, and the tooltip. */
const fullText = (
  column: SpreadsheetColumn | undefined,
  value: SpreadsheetCellValue,
): string =>
  column?.type === "uuid" ? toCanonicalUuidString(value) : String(value);

/** The text of a resting cell; uuids are truncated. */
const displayText = (
  column: SpreadsheetColumn | undefined,
  value: SpreadsheetCellValue,
): string =>
  column?.type === "uuid"
    ? `${toCanonicalUuidString(value).slice(0, 8)}…`
    : String(value);

/** Untyped columns parse like `real`; the per-type rules live in core. */
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

const isDeleteKey = (event: React.KeyboardEvent): boolean =>
  event.key === "Delete" || event.key === "Backspace";

const isTypingKey = (event: React.KeyboardEvent): boolean =>
  event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;

/**
 * An editable grid of typed cells with a row-number gutter and a sticky
 * phantom row that becomes a real row on its first edit. Controlled: the
 * parent owns `data` and receives edits through `onChange`.
 *
 * The worksheet focus layer owns movement: the grid is one Tab stop, arrows
 * walk cells and the gutter, and a move past an edge is offered to the
 * enclosing `FocusStack`, so sibling grids flow into each other. Clicks are
 * select-first: the first click selects a cell, a click on the selected cell
 * opens its editor.
 */
export const Spreadsheet: React.FC<SpreadsheetProps> = ({
  columns,
  data,
  onChange,
}) => {
  const isReadOnly = !onChange;
  const colCount = columns.length;

  const [editingCellState, setEditingCell] = useState<CellPosition | null>(
    null,
  );
  const [editingValue, setEditingValue] = useState("");
  const targets = useRef<Map<string, HTMLElement>>(new Map());

  // A position past the current data is stale: masked rather than synced.
  const editingCell =
    editingCellState && editingCellState.row <= data.length
      ? editingCellState
      : null;

  const emptyRow = (): SpreadsheetCellValue[] =>
    columns.map(getDefaultCellValue);
  const displayRows = isReadOnly ? data : [...data, emptyRow()];

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
    focusLands(targets.current.get(targetKey({ stopId: String(row), column })));

  const updateCell = (
    row: number,
    col: number,
    value: SpreadsheetCellValue,
  ) => {
    // An edit on the phantom row (index `data.length`) materializes it.
    const rows = row === data.length ? [...data, emptyRow()] : [...data];
    const cells = rows[row];
    if (cells) {
      rows[row] = cells.map((cell, index) => (index === col ? value : cell));
      onChange?.(rows);
    }
  };

  const toggleBooleanCell = (row: number, col: number) => {
    // Truthiness, so a numerically encoded 1 toggles off like `true` does.
    updateCell(
      row,
      col,
      !(data[row]?.[col] ?? getDefaultCellValue(columns[col])),
    );
  };

  /** Opens the editor synchronously so the mounted input can take focus. */
  const startEditing = (row: number, col: number, text: string) => {
    flushSync(() => {
      setEditingCell({ row, col });
      setEditingValue(text);
    });
    focusCell(row, col);
  };

  /** Closes the editor synchronously so the resting cell can take focus. */
  const closeEditor = (row: number, col: number, commit: boolean) => {
    flushSync(() => {
      if (commit) {
        updateCell(row, col, parseCellValue(columns[col], editingValue));
      }
      setEditingCell(null);
      setEditingValue("");
    });
  };

  const onEditingKeyDown =
    (row: number, col: number): React.KeyboardEventHandler =>
    (event) => {
      if (event.key === "Enter") {
        handled(event);
        closeEditor(row, col, true);
        // Advance right, wrap to the next row's first cell, or stay put.
        const moved =
          col + 1 < colCount ? focusCell(row, col + 1) : focusCell(row + 1, 0);
        if (!moved) {
          focusCell(row, col);
        }
      } else if (event.key === "Escape") {
        handled(event);
        closeEditor(row, col, false);
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
        startEditing(row, col, fullText(columns[col], value));
      } else if (isDeleteKey(event)) {
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
      const typed = isTypingKey(event) ? event.key.toLowerCase() : null;
      if (event.key === "Enter" || event.key === " ") {
        handled(event);
        toggleBooleanCell(row, col);
      } else if (isDeleteKey(event) || typed === "f" || typed === "0") {
        handled(event);
        updateCell(row, col, false);
      } else if (typed === "t" || typed === "1") {
        handled(event);
        updateCell(row, col, true);
      } else if (typed !== null) {
        // Other printable keys never open a text editor on a boolean cell.
        handled(event);
      } else {
        onStopsKeyDown({ stopId: String(row), column: col })(event);
      }
    };

  const onGutterKeyDown =
    (row: number): React.KeyboardEventHandler =>
    (event) => {
      if (isDeleteKey(event)) {
        handled(event);
        // Rows are index-keyed, so the gutter element stays mounted and the
        // next row slides under the focus.
        if (row < data.length) {
          onChange?.(data.filter((_, index) => index !== row));
        }
      } else if (event.key === "Enter") {
        handled(event);
        focusCell(row, 0);
      } else {
        onStopsKeyDown({ stopId: String(row), column: "gutter" })(event);
      }
    };

  const gutterProps = (row: number) => {
    const target: FocusStopTarget = { stopId: String(row), column: "gutter" };
    return {
      ref: registerTarget(target),
      tabIndex: tabIndexFor(target),
      onKeyDown: onGutterKeyDown(row),
      onFocus: () => {
        onFocusTarget(target);
        setFocusedRow(row);
      },
      onBlur: () => setFocusedRow(null),
    };
  };

  const columnWidth = Math.max(60, 100 / colCount);

  return (
    <div className={wrapperStyle}>
      <div ref={attach} className={tableContainerStyle}>
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
              const isPhantomRow = rowIndex === data.length;
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
                    className={rowNumberCellStyle({
                      isSelected: selectedRow === rowIndex,
                      isPhantom: isPhantomRow,
                      isReadOnly,
                    })}
                    {...(isReadOnly ? undefined : gutterProps(rowIndex))}
                  >
                    {isPhantomRow ? "" : rowIndex + 1}
                  </td>
                  {row.map((value, colIndex) => {
                    const column = columns[colIndex];
                    const target: FocusStopTarget = {
                      stopId,
                      column: colIndex,
                    };
                    const isEditing =
                      editingCell?.row === rowIndex &&
                      editingCell.col === colIndex;
                    // Screen readers get the full value the truncated cell hides.
                    const title =
                      isTextColumn(column) && !isPhantomRow
                        ? fullText(column, value)
                        : undefined;
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
                            title={title}
                            aria-label={title}
                          >
                            {displayText(column, value)}
                          </div>
                        ) : isEditing ? (
                          <input
                            ref={registerTarget(target)}
                            type={isTextColumn(column) ? "text" : "number"}
                            step={
                              isTextColumn(column)
                                ? undefined
                                : column?.type === "integer"
                                  ? 1
                                  : "any"
                            }
                            value={editingValue}
                            onChange={(event) =>
                              setEditingValue(event.target.value)
                            }
                            onKeyDown={onEditingKeyDown(rowIndex, colIndex)}
                            onBlur={() => closeEditor(rowIndex, colIndex, true)}
                            className={editingInputStyle}
                          />
                        ) : column?.type === "boolean" ? (
                          <div
                            ref={registerTarget(target)}
                            role="checkbox"
                            aria-checked={Boolean(value)}
                            aria-label={column.name}
                            tabIndex={tabIndexFor(target)}
                            onFocus={() => onFocusTarget(target)}
                            onKeyDown={onBooleanCellKeyDown(rowIndex, colIndex)}
                            onClick={() =>
                              toggleBooleanCell(rowIndex, colIndex)
                            }
                            className={cellButtonStyle}
                          >
                            {/* Visual only: the wrapper owns the checkbox role. */}
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
                                  fullText(column, value),
                                );
                              }
                            }}
                            className={cellButtonStyle}
                            title={title}
                            aria-label={title}
                          >
                            {isPhantomRow ? "" : displayText(column, value)}
                          </div>
                        )}
                        {!isReadOnly &&
                        !isEditing &&
                        !isPhantomRow &&
                        column?.type === "uuid" ? (
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
