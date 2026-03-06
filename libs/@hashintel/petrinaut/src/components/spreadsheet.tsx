import { css, cva } from "@hashintel/ds-helpers/css";
import { useEffect, useRef, useState } from "react";

export interface SpreadsheetColumn {
  id: string;
  name: string;
}

export interface SpreadsheetProps {
  columns: SpreadsheetColumn[];
  data: number[][];
  onChange?: (data: number[][]) => void;
}

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
        zIndex: 1,
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

export const Spreadsheet: React.FC<SpreadsheetProps> = ({
  columns,
  data,
  onChange,
}) => {
  const isReadOnly = !onChange;
  const colCount = columns.length;

  const [tableData, setTableData] = useState<number[][]>(data);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [focusedCell, setFocusedCell] = useState<{
    row: number;
    col: number;
  } | null>(null);
  const [editingCell, setEditingCell] = useState<{
    row: number;
    col: number;
  } | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync internal state when data prop changes externally
  useEffect(() => {
    setTableData((prev) => {
      if (
        prev.length === data.length &&
        prev.every((row, i) => row === data[i])
      ) {
        return prev;
      }
      return data.length > 0 ? data : [];
    });
    if (data.length === 0) {
      setSelectedRow(null);
      setFocusedCell(null);
      setEditingCell(null);
    }
  }, [data]);

  const updateCell = (row: number, col: number, value: number) => {
    setTableData((prev) => {
      let newData: number[][];

      // If editing the phantom row (last row), create a new actual row
      if (row === prev.length) {
        newData = [...prev, Array(colCount).fill(0) as number[]];
        if (newData[row]) {
          newData[row][col] = value;
        }
      } else {
        newData = prev.map((rowData, index) =>
          index === row ? [...rowData] : rowData,
        );
        if (newData[row]) {
          newData[row][col] = value;
        }
      }

      onChange?.(newData);
      return newData;
    });
  };

  const removeRow = (rowIndex: number) => {
    setTableData((prev) => {
      const newData: number[][] = prev.filter((_, index) => index !== rowIndex);
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
            const rowCell = document.querySelector(
              `td[data-row="${rowIndex}"]`,
            );
            if (rowCell instanceof HTMLElement) {
              rowCell.focus();
            }
          }, 0);
        }
      } else {
        setSelectedRow(null);
      }

      return newData;
    });
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
        const value = Number.parseFloat(editingValue) || 0;
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
        const value = Number.parseFloat(editingValue) || 0;
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
      setEditingValue(String(tableData[row]?.[col] ?? 0));
      setTimeout(() => inputRef.current?.focus(), 0);
    } else if (event.key === "Delete") {
      event.preventDefault();
      if (selectedRow !== null) {
        removeRow(selectedRow);
      } else {
        updateCell(row, col, 0);
        setEditingCell({ row, col });
        setEditingValue("");
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    } else if (event.key === "Backspace") {
      event.preventDefault();
      updateCell(row, col, 0);
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
                : [...tableData, Array(colCount).fill(0) as number[]];
              return displayRows.map((row, rowIndex) => {
                const isPhantomRow =
                  !isReadOnly && rowIndex === tableData.length;
                return (
                  <tr
                    // eslint-disable-next-line react/no-array-index-key -- Row position is stable and meaningful
                    key={`row-${rowIndex}-${row.join("-")}`}
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
                            <div className={readOnlyCellStyle}>
                              {isPhantomRow ? "" : value}
                            </div>
                          ) : isEditing ? (
                            <input
                              ref={inputRef}
                              type="number"
                              value={editingValue}
                              onChange={(event) =>
                                setEditingValue(event.target.value)
                              }
                              onKeyDown={(event) =>
                                handleKeyDown(event, rowIndex, colIndex)
                              }
                              onBlur={() => {
                                const val =
                                  Number.parseFloat(editingValue) || 0;
                                updateCell(rowIndex, colIndex, val);
                                setEditingCell(null);
                                setEditingValue("");
                              }}
                              className={editingInputStyle}
                            />
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
                            >
                              {isPhantomRow ? "" : value}
                            </div>
                          )}
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
