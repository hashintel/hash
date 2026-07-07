import { useRef, useState } from "react";

import { css, cva } from "@hashintel/ds-helpers/css";
import {
  defaultTokenAttributeValue,
  formatUuid,
  toUuid,
  TYPE_POLICIES,
} from "@hashintel/petrinaut-core";

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

const cellButtonStyle = cva({
  base: {
    width: "[100%]",
    height: "[28px]",
    padding: "[4px 8px]",
    fontFamily: "mono",
    fontSize: "xs",
    backgroundColor: "[transparent]",
    outlineOffset: "[-2px]",
    cursor: "default",
    boxSizing: "border-box",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    display: "flex",
    alignItems: "center",
  },
  variants: {
    isFocused: {
      true: { outline: "[2px solid {colors.blue.s50}]" },
      false: { outline: "none" },
    },
  },
});

const booleanCellStyle = css({
  margin: "0",
});

/**
 * Selected uuid cells expand to the full canonical string, spilling over the
 * neighbouring cells (spreadsheet-style overflow). Pointer events pass
 * through so double-click still opens the editor underneath. Cells in the
 * right half of the table spill leftwards so the overlay is not clipped by
 * the scroll container's edge.
 */
const uuidExpandedOverlayStyle = cva({
  base: {
    position: "absolute",
    top: "[0]",
    height: "[28px]",
    display: "flex",
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

export const Spreadsheet: React.FC<SpreadsheetProps> = ({
  columns,
  data,
  onChange,
}) => {
  const isReadOnly = !onChange;
  const colCount = columns.length;

  // Fully controlled — the parent owns `data` and receives edits via
  // `onChange`. Selection / focus / editing state is local UI state, clamped
  // against the current `data` so stale positions are masked rather than
  // synced via an effect.
  const tableData = data.length > 0 ? data : [];

  const [selectedRowState, setSelectedRow] = useState<number | null>(null);
  const [focusedCellState, setFocusedCell] = useState<CellPosition | null>(
    null,
  );
  const [editingCellState, setEditingCell] = useState<CellPosition | null>(
    null,
  );
  const [editingValue, setEditingValue] = useState<string>("");
  const cellRefs = useRef<Map<string, HTMLElement>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedRow =
    selectedRowState !== null && selectedRowState < tableData.length
      ? selectedRowState
      : null;
  const focusedCell =
    focusedCellState && focusedCellState.row <= tableData.length
      ? focusedCellState
      : null;
  const editingCell =
    editingCellState && editingCellState.row <= tableData.length
      ? editingCellState
      : null;

  const createEmptyRow = (): SpreadsheetCellValue[] =>
    columns.map((column) => getDefaultCellValue(column));

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

  const removeRow = (rowIndex: number) => {
    const newData: SpreadsheetCellValue[][] = tableData.filter(
      (_, index) => index !== rowIndex,
    );
    onChange?.(newData);

    // Select next or previous row after deletion
    if (newData.length > 0) {
      if (rowIndex >= newData.length) {
        setSelectedRow(newData.length - 1);
        setTimeout(() => {
          const rowCell = document.querySelector(
            `td[data-row="${newData.length - 1}"]`,
          );
          if (rowCell instanceof HTMLElement) {
            rowCell.focus();
          }
        }, 0);
      } else {
        setSelectedRow(rowIndex);
        setTimeout(() => {
          const rowCell = document.querySelector(`td[data-row="${rowIndex}"]`);
          if (rowCell instanceof HTMLElement) {
            rowCell.focus();
          }
        }, 0);
      }
    } else {
      setSelectedRow(null);
    }
  };

  const handleKeyDown = (
    event: React.KeyboardEvent,
    row: number,
    col: number,
  ) => {
    if (isReadOnly) {
      return;
    }

    // Stop propagation for all navigation and delete keys to prevent global handlers
    if (
      event.key === "ArrowRight" ||
      event.key === "ArrowLeft" ||
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "Delete" ||
      event.key === "Backspace" ||
      event.key === "Tab"
    ) {
      event.stopPropagation();
    }

    // If we're editing, only Enter and Tab should exit editing mode
    if (editingCell && editingCell.row === row && editingCell.col === col) {
      if (event.key === "Enter") {
        event.preventDefault();
        const value = parseCellValue(columns[col], editingValue);
        updateCell(row, col, value);
        setEditingCell(null);
        setEditingValue("");
        setSelectedRow(null);

        // Move to next cell
        if (col < colCount - 1) {
          setFocusedCell({ row, col: col + 1 });
          setTimeout(() => {
            const nextCell = cellRefs.current.get(`${row}-${col + 1}`);
            nextCell?.focus();
          }, 0);
        } else if (row < tableData.length) {
          setFocusedCell({ row: row + 1, col: 0 });
          setTimeout(() => {
            const nextCell = cellRefs.current.get(`${row + 1}-0`);
            nextCell?.focus();
          }, 0);
        }
      } else if (event.key === "Tab") {
        event.preventDefault();
        const value = parseCellValue(columns[col], editingValue);
        updateCell(row, col, value);
        setEditingCell(null);
        setEditingValue("");
        setSelectedRow(null);

        if (event.shiftKey) {
          if (col > 0) {
            setFocusedCell({ row, col: col - 1 });
            setTimeout(() => {
              const prevCell = cellRefs.current.get(`${row}-${col - 1}`);
              prevCell?.focus();
            }, 0);
          } else if (row > 0) {
            setFocusedCell({ row: row - 1, col: colCount - 1 });
            setTimeout(() => {
              const prevCell = cellRefs.current.get(
                `${row - 1}-${colCount - 1}`,
              );
              prevCell?.focus();
            }, 0);
          }
        } else if (col < colCount - 1) {
          setFocusedCell({ row, col: col + 1 });
          setTimeout(() => {
            const nextCell = cellRefs.current.get(`${row}-${col + 1}`);
            nextCell?.focus();
          }, 0);
        } else if (row < tableData.length) {
          setFocusedCell({ row: row + 1, col: 0 });
          setTimeout(() => {
            const nextCell = cellRefs.current.get(`${row + 1}-0`);
            nextCell?.focus();
          }, 0);
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        setEditingCell(null);
        setEditingValue("");
        setFocusedCell({ row, col });
        setTimeout(() => {
          const cell = cellRefs.current.get(`${row}-${col}`);
          cell?.focus();
        }, 0);
      }
      return;
    }

    if (columns[col]?.type === "boolean") {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleBooleanCell(row, col);
        setSelectedRow(null);
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        updateCell(row, col, false);
        setSelectedRow(null);
        return;
      }

      const normalizedKey = event.key.toLowerCase();
      if (normalizedKey === "t" || normalizedKey === "1") {
        event.preventDefault();
        updateCell(row, col, true);
        setSelectedRow(null);
        return;
      }
      if (normalizedKey === "f" || normalizedKey === "0") {
        event.preventDefault();
        updateCell(row, col, false);
        setSelectedRow(null);
        return;
      }
      // Swallow any other printable key — boolean cells never open the text
      // editor (but keep shortcuts like Cmd+C working).
      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        return;
      }
    }

    // Navigation keys when not editing
    if (event.key === "ArrowRight" && col < colCount - 1) {
      event.preventDefault();
      setSelectedRow(null);
      setFocusedCell({ row, col: col + 1 });
      setTimeout(() => {
        const nextCell = cellRefs.current.get(`${row}-${col + 1}`);
        nextCell?.focus();
      }, 0);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (col > 0) {
        setSelectedRow(null);
        setFocusedCell({ row, col: col - 1 });
        setTimeout(() => {
          const prevCell = cellRefs.current.get(`${row}-${col - 1}`);
          prevCell?.focus();
        }, 0);
      } else {
        setFocusedCell(null);
        setSelectedRow(row);
        setTimeout(() => {
          const rowCell = document.querySelector(`td[data-row="${row}"]`);
          if (rowCell instanceof HTMLElement) {
            rowCell.focus();
          }
        }, 0);
      }
    } else if (event.key === "ArrowDown" && row < tableData.length) {
      event.preventDefault();
      setSelectedRow(null);
      setFocusedCell({ row: row + 1, col });
      setTimeout(() => {
        const nextCell = cellRefs.current.get(`${row + 1}-${col}`);
        nextCell?.focus();
      }, 0);
    } else if (event.key === "ArrowUp" && row > 0) {
      event.preventDefault();
      setSelectedRow(null);
      setFocusedCell({ row: row - 1, col });
      setTimeout(() => {
        const prevCell = cellRefs.current.get(`${row - 1}-${col}`);
        prevCell?.focus();
      }, 0);
    } else if (event.key === "Tab") {
      event.preventDefault();
      setSelectedRow(null);

      if (event.shiftKey) {
        if (col > 0) {
          setFocusedCell({ row, col: col - 1 });
          setTimeout(() => {
            const prevCell = cellRefs.current.get(`${row}-${col - 1}`);
            prevCell?.focus();
          }, 0);
        } else if (row > 0) {
          setFocusedCell({ row: row - 1, col: colCount - 1 });
          setTimeout(() => {
            const prevCell = cellRefs.current.get(`${row - 1}-${colCount - 1}`);
            prevCell?.focus();
          }, 0);
        }
      } else if (col < colCount - 1) {
        setFocusedCell({ row, col: col + 1 });
        setTimeout(() => {
          const nextCell = cellRefs.current.get(`${row}-${col + 1}`);
          nextCell?.focus();
        }, 0);
      } else if (row < tableData.length) {
        setFocusedCell({ row: row + 1, col: 0 });
        setTimeout(() => {
          const nextCell = cellRefs.current.get(`${row + 1}-0`);
          nextCell?.focus();
        }, 0);
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      setEditingCell({ row, col });
      setEditingValue(
        getCellEditText(
          columns[col],
          tableData[row]?.[col] ?? getDefaultCellValue(columns[col]),
        ),
      );
      setTimeout(() => inputRef.current?.focus(), 0);
    } else if (event.key === "Delete") {
      event.preventDefault();
      if (selectedRow !== null) {
        removeRow(selectedRow);
      } else {
        updateCell(row, col, getDefaultCellValue(columns[col]));
        setEditingCell({ row, col });
        setEditingValue("");
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    } else if (event.key === "Backspace") {
      event.preventDefault();
      updateCell(row, col, getDefaultCellValue(columns[col]));
      setEditingCell({ row, col });
      setEditingValue("");
      setTimeout(() => inputRef.current?.focus(), 0);
    } else if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      event.key.length === 1
    ) {
      event.preventDefault();
      setEditingCell({ row, col });
      setEditingValue(event.key);
      setTimeout(() => inputRef.current?.focus(), 0);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setFocusedCell(null);
      const cell = cellRefs.current.get(`${row}-${col}`);
      if (cell) {
        cell.blur();
      }
    }
  };

  const handleRowClick = (rowIndex: number) => {
    setSelectedRow(rowIndex);
    setFocusedCell(null);
    setEditingCell(null);
  };

  const handleRowKeyDown = (event: React.KeyboardEvent, rowIndex: number) => {
    if (isReadOnly) {
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      event.stopPropagation();
      removeRow(rowIndex);
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      setSelectedRow(null);
      setFocusedCell({ row: rowIndex, col: 0 });
      setTimeout(() => {
        const firstCell = cellRefs.current.get(`${rowIndex}-0`);
        firstCell?.focus();
      }, 0);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      setSelectedRow(null);
      setFocusedCell({ row: rowIndex, col: 0 });
      setTimeout(() => {
        const firstCell = cellRefs.current.get(`${rowIndex}-0`);
        firstCell?.focus();
      }, 0);
    } else if (event.key === "ArrowDown" && rowIndex < tableData.length - 1) {
      event.preventDefault();
      event.stopPropagation();
      setSelectedRow(rowIndex + 1);
      setFocusedCell(null);
      setEditingCell(null);
      const nextRowCell = document.querySelector(
        `td[data-row="${rowIndex + 1}"]`,
      );
      if (nextRowCell instanceof HTMLElement) {
        nextRowCell.focus();
      }
    } else if (event.key === "ArrowUp" && rowIndex > 0) {
      event.preventDefault();
      event.stopPropagation();
      setSelectedRow(rowIndex - 1);
      setFocusedCell(null);
      setEditingCell(null);
      const prevRowCell = document.querySelector(
        `td[data-row="${rowIndex - 1}"]`,
      );
      if (prevRowCell instanceof HTMLElement) {
        prevRowCell.focus();
      }
    }
  };

  const columnWidth = Math.max(60, 100 / colCount);

  return (
    <div className={wrapperStyle}>
      <div className={tableContainerStyle} style={{ flex: 1, minHeight: 0 }}>
        <table className={tableStyle}>
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
            {(() => {
              const displayRows = isReadOnly
                ? tableData
                : [...tableData, createEmptyRow()];
              return displayRows.map((row, rowIndex) => {
                const isPhantomRow =
                  !isReadOnly && rowIndex === tableData.length;
                return (
                  <tr
                    // eslint-disable-next-line react/no-array-index-key -- Row position is stable and meaningful; cell contents must stay out of the key (string cells are arbitrary-length, and value changes should update the row, not remount it)
                    key={`row-${rowIndex}`}
                    className={rowStyle({
                      isSelected: selectedRow === rowIndex,
                      isSticky: isPhantomRow,
                    })}
                  >
                    <td
                      data-row={rowIndex}
                      onClick={() => handleRowClick(rowIndex)}
                      onKeyDown={(event) => handleRowKeyDown(event, rowIndex)}
                      tabIndex={0}
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
                      const isFocused =
                        focusedCell?.row === rowIndex &&
                        focusedCell.col === colIndex;
                      return (
                        <td
                          // eslint-disable-next-line react/no-array-index-key -- Column position is stable and meaningful
                          key={`cell-${rowIndex}-${colIndex}`}
                          className={cellContainerStyle({
                            isSticky: isPhantomRow,
                          })}
                          style={{ width: `${columnWidth}%` }}
                        >
                          {isReadOnly ? (
                            <div
                              className={readOnlyCellStyle}
                              title={
                                isPhantomRow
                                  ? undefined
                                  : getCellTitle(columns[colIndex], value)
                              }
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
                          ) : isEditing ? (
                            <input
                              ref={inputRef}
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
                              onKeyDown={(event) =>
                                handleKeyDown(event, rowIndex, colIndex)
                              }
                              onBlur={() => {
                                const val = parseCellValue(
                                  columns[colIndex],
                                  editingValue,
                                );
                                updateCell(rowIndex, colIndex, val);
                                setEditingCell(null);
                                setEditingValue("");
                              }}
                              className={editingInputStyle}
                            />
                          ) : columns[colIndex]?.type === "boolean" ? (
                            <div
                              ref={(el) => {
                                if (el) {
                                  cellRefs.current.set(
                                    `${rowIndex}-${colIndex}`,
                                    el,
                                  );
                                } else {
                                  cellRefs.current.delete(
                                    `${rowIndex}-${colIndex}`,
                                  );
                                }
                              }}
                              role="checkbox"
                              aria-checked={Boolean(value)}
                              aria-label={columns[colIndex].name}
                              tabIndex={0}
                              onFocus={() => {
                                setFocusedCell({
                                  row: rowIndex,
                                  col: colIndex,
                                });
                                setSelectedRow(null);
                              }}
                              onKeyDown={(event) =>
                                handleKeyDown(event, rowIndex, colIndex)
                              }
                              onClick={() =>
                                toggleBooleanCell(rowIndex, colIndex)
                              }
                              className={cellButtonStyle({ isFocused })}
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
                              ref={(el) => {
                                if (el) {
                                  cellRefs.current.set(
                                    `${rowIndex}-${colIndex}`,
                                    el,
                                  );
                                } else {
                                  cellRefs.current.delete(
                                    `${rowIndex}-${colIndex}`,
                                  );
                                }
                              }}
                              role="button"
                              tabIndex={0}
                              onFocus={() => {
                                setFocusedCell({
                                  row: rowIndex,
                                  col: colIndex,
                                });
                                setSelectedRow(null);
                              }}
                              onKeyDown={(event) =>
                                handleKeyDown(event, rowIndex, colIndex)
                              }
                              className={cellButtonStyle({ isFocused })}
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
                          isFocused &&
                          columns[colIndex]?.type === "uuid" ? (
                            <span
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
              });
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
};
