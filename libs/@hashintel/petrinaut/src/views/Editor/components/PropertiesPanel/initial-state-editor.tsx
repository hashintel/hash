import { css, cva } from "@hashintel/ds-helpers/css";
import { useEffect, useRef, useState } from "react";
import { TbTrash } from "react-icons/tb";

import { InfoIconTooltip } from "../../../../components/tooltip";
import type { Color } from "../../../../core/types/sdcpn";
import { useSimulationStore } from "../../../../state/simulation-provider";

const headerRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "[4px]",
  height: "[20px]",
});

const headerLabelStyle = css({
  fontWeight: 500,
  fontSize: "[12px]",
});

const clearButtonStyle = css({
  fontSize: "[11px]",
  padding: "[2px 8px]",
  border: "[1px solid rgba(0, 0, 0, 0.2)]",
  borderRadius: "[3px]",
  backgroundColor: "[white]",
  cursor: "pointer",
  color: "[#666]",
  display: "flex",
  alignItems: "center",
  gap: "[4px]",
});

const tableContainerStyle = css({
  position: "relative",
  border: "[1px solid rgba(0, 0, 0, 0.1)]",
  borderRadius: "[4px]",
  overflow: "auto",
  width: "[100%]",
  backgroundColor: "[#fafafa]",
});

const tableStyle = css({
  width: "[100%]",
  borderCollapse: "collapse",
  fontSize: "[12px]",
  tableLayout: "fixed",
});

const rowNumberHeaderStyle = css({
  position: "sticky",
  top: "[0]",
  backgroundColor: "[#f5f5f5]",
  borderBottom: "[1px solid rgba(0, 0, 0, 0.1)]",
  borderRight: "[1px solid rgba(0, 0, 0, 0.1)]",
  padding: "[4px 8px]",
  textAlign: "center",
  fontWeight: 500,
  width: "[40px]",
  minWidth: "[40px]",
});

const columnHeaderStyle = css({
  position: "sticky",
  top: "[0]",
  backgroundColor: "[#f5f5f5]",
  borderBottom: "[1px solid rgba(0, 0, 0, 0.1)]",
  padding: "[4px 8px]",
  textAlign: "left",
  fontWeight: 500,
  fontFamily: "[monospace]",
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
      true: { backgroundColor: "[rgba(59, 130, 246, 0.1)]" },
      false: { backgroundColor: "[white]" },
    },
  },
});

const rowNumberCellStyle = cva({
  base: {
    borderRight: "[1px solid rgba(0, 0, 0, 0.1)]",
    borderBottom: "[1px solid rgba(0, 0, 0, 0.05)]",
    padding: "[4px 8px]",
    textAlign: "center",
    fontWeight: 500,
    outline: "none",
  },
  variants: {
    isSelected: {
      true: { backgroundColor: "[rgba(59, 130, 246, 0.2)]" },
      false: { backgroundColor: "[#fafafa]" },
    },
    isPhantom: {
      true: { color: "[#ccc]" },
      false: { color: "[#666]" },
    },
    hasSimulation: {
      true: { cursor: "default" },
      false: { cursor: "pointer" },
    },
  },
});

const cellContainerStyle = css({
  borderBottom: "[1px solid rgba(0, 0, 0, 0.05)]",
  padding: "spacing.0",
  height: "[28px]",
});

const readOnlyCellStyle = css({
  height: "[28px]",
  display: "flex",
  alignItems: "center",
  fontFamily: "[monospace]",
  fontSize: "[12px]",
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
  fontFamily: "[monospace]",
  fontSize: "[12px]",
  backgroundColor: "[rgba(59, 130, 246, 0.05)]",
  outline: "[2px solid #3b82f6]",
  outlineOffset: "[-2px]",
  boxSizing: "border-box",
});

const cellButtonStyle = cva({
  base: {
    width: "[100%]",
    height: "[28px]",
    padding: "[4px 8px]",
    fontFamily: "[monospace]",
    fontSize: "[12px]",
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
      true: { outline: "[2px solid #3b82f6]" },
      false: { outline: "none" },
    },
  },
});

const resizeHandleStyle = cva({
  base: {
    position: "absolute",
    bottom: "[0]",
    left: "[0]",
    right: "[0]",
    height: "[8px]",
    cursor: "ns-resize",
    border: "none",
    padding: "spacing.0",
    zIndex: 10,
  },
  variants: {
    isResizing: {
      true: { backgroundColor: "[rgba(0, 0, 0, 0.1)]" },
      false: { backgroundColor: "[transparent]" },
    },
  },
});

/**
 * Hook to make an element resizable by dragging its bottom border
 */
const useResizable = (initialHeight: number) => {
  const [height, setHeight] = useState(initialHeight);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const newHeight = event.clientY - rect.top;
      if (newHeight >= 100 && newHeight <= 600) {
        setHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  return {
    height,
    isResizing,
    containerRef,
    startResize: () => setIsResizing(true),
  };
};

// --- Component ---

/**
 * InitialStateEditor - A component for editing initial tokens in a place
 * Stores data in SimulationStore, not in the Place definition
 */
interface InitialStateEditorProps {
  placeId: string;
  placeType: Color;
}

export const InitialStateEditor: React.FC<InitialStateEditorProps> = ({
  placeId,
  placeType,
}) => {
  const { height, isResizing, containerRef, startResize } = useResizable(250);

  const isSimulationNotRun = useSimulationStore(
    (state) => state.state === "NotRun",
  );

  const initialMarking = useSimulationStore((state) => state.initialMarking);
  const setInitialMarking = useSimulationStore(
    (state) => state.setInitialMarking,
  );
  const simulation = useSimulationStore((state) => state.simulation);
  const currentlyViewedFrame = useSimulationStore(
    (state) => state.currentlyViewedFrame,
  );

  // Determine if we should show current simulation state or initial marking
  const hasSimulation = simulation !== null && simulation.frames.length > 0;

  // Get current marking for this place - either from simulation frame or initial marking
  const getCurrentMarkingData = (): {
    values: Float64Array;
    count: number;
  } | null => {
    if (hasSimulation) {
      // Get from currently viewed frame
      const currentFrame = simulation.frames[currentlyViewedFrame];
      if (!currentFrame) {
        return null;
      }

      const placeState = currentFrame.places.get(placeId);
      if (!placeState) {
        return null;
      }

      const { offset, count, dimensions } = placeState;
      const placeSize = count * dimensions;
      const values = currentFrame.buffer.slice(offset, offset + placeSize);

      return { values, count };
    }

    // Get from initial marking
    return initialMarking.get(placeId) ?? null;
  };

  const currentMarking = getCurrentMarkingData();

  // Initialize table data from current marking or empty row
  const [tableData, setTableData] = useState<number[][]>(() => {
    if (currentMarking && currentMarking.count > 0) {
      // Convert Float64Array back to 2D array based on place type dimensions
      const dimensions = placeType.elements.length;
      const tokens: number[][] = [];
      for (let i = 0; i < currentMarking.count; i++) {
        const tokenValues: number[] = [];
        for (let colIndex = 0; colIndex < dimensions; colIndex++) {
          tokenValues.push(
            currentMarking.values[i * dimensions + colIndex] ?? 0,
          );
        }
        tokens.push(tokenValues);
      }
      return tokens;
    }
    return [];
  });

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

  // Update table data when marking changes externally
  useEffect(() => {
    if (currentMarking) {
      if (currentMarking.count > 0) {
        const dimensions = placeType.elements.length;
        const tokens: number[][] = [];
        for (let i = 0; i < currentMarking.count; i++) {
          const tokenValues: number[] = [];
          for (let colIndex = 0; colIndex < dimensions; colIndex++) {
            tokenValues.push(
              currentMarking.values[i * dimensions + colIndex] ?? 0,
            );
          }
          tokens.push(tokenValues);
        }
        setTableData(tokens);
      } else {
        // When count is 0, set empty table data
        setTableData([]);
      }
    }
  }, [currentMarking, placeType.elements.length]);

  // Convert table data to Float64Array and save to simulation store
  const saveToStore = (data: number[][]) => {
    const dimensions = placeType.elements.length;
    const count = data.length;
    const values = new Float64Array(count * dimensions);

    for (let i = 0; i < count; i++) {
      for (let col = 0; col < dimensions; col++) {
        values[i * dimensions + col] = data[i]?.[col] ?? 0;
      }
    }

    setInitialMarking(placeId, { values, count });
  };

  const updateCell = (row: number, col: number, value: number) => {
    setTableData((prev) => {
      let newData: number[][];

      // If editing the phantom row (last row), create a new actual row
      if (row === prev.length) {
        newData = [
          ...prev,
          Array(placeType.elements.length).fill(0) as number[],
        ];
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

      saveToStore(newData);
      return newData;
    });
  };

  const removeRow = (rowIndex: number) => {
    setTableData((prev) => {
      const newData: number[][] = prev.filter((_, index) => index !== rowIndex);
      saveToStore(newData);

      // Select next or previous row after deletion
      if (newData.length > 0) {
        // If deleted row was last, select the new last row
        if (rowIndex >= newData.length) {
          setSelectedRow(newData.length - 1);
          // Focus the row number cell after state update
          setTimeout(() => {
            const rowCell = document.querySelector(
              `td[data-row="${newData.length - 1}"]`,
            );
            if (rowCell instanceof HTMLElement) {
              rowCell.focus();
            }
          }, 0);
        } else {
          // Select the next row (which now has the same index)
          setSelectedRow(rowIndex);
          // Focus the row number cell after state update
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

  const clearState = () => {
    setTableData([]);
    saveToStore([]);
    setSelectedRow(null);
    setFocusedCell(null);
    setEditingCell(null);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent,
    row: number,
    col: number,
  ) => {
    if (hasSimulation) {
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
        // Save the value and move to next cell (or phantom row if at end)
        const value = Number.parseFloat(editingValue) || 0;
        updateCell(row, col, value);
        setEditingCell(null);
        setEditingValue("");
        setSelectedRow(null);

        // Move to next cell
        if (col < placeType.elements.length - 1) {
          // Move right in the same row
          setFocusedCell({ row, col: col + 1 });
          setTimeout(() => {
            const nextCell = cellRefs.current.get(`${row}-${col + 1}`);
            nextCell?.focus();
          }, 0);
        } else if (row < tableData.length) {
          // Move to first cell of next row (or phantom row)
          setFocusedCell({ row: row + 1, col: 0 });
          setTimeout(() => {
            const nextCell = cellRefs.current.get(`${row + 1}-0`);
            nextCell?.focus();
          }, 0);
        }
      } else if (event.key === "Tab") {
        event.preventDefault();
        // Save the value and move to next/previous cell
        const value = Number.parseFloat(editingValue) || 0;
        updateCell(row, col, value);
        setEditingCell(null);
        setEditingValue("");
        setSelectedRow(null);

        if (event.shiftKey) {
          // Move to previous cell (left, or wrap to previous row)
          if (col > 0) {
            setFocusedCell({ row, col: col - 1 });
            setTimeout(() => {
              const prevCell = cellRefs.current.get(`${row}-${col - 1}`);
              prevCell?.focus();
            }, 0);
          } else if (row > 0) {
            setFocusedCell({
              row: row - 1,
              col: placeType.elements.length - 1,
            });
            setTimeout(() => {
              const prevCell = cellRefs.current.get(
                `${row - 1}-${placeType.elements.length - 1}`,
              );
              prevCell?.focus();
            }, 0);
          }
        } else if (col < placeType.elements.length - 1) {
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
        // Cancel editing and focus the cell (not entered state)
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
    if (event.key === "ArrowRight" && col < placeType.elements.length - 1) {
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
        // When on first column, select the row
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
        // Move to previous cell (left, or wrap to previous row)
        if (col > 0) {
          setFocusedCell({ row, col: col - 1 });
          setTimeout(() => {
            const prevCell = cellRefs.current.get(`${row}-${col - 1}`);
            prevCell?.focus();
          }, 0);
        } else if (row > 0) {
          setFocusedCell({ row: row - 1, col: placeType.elements.length - 1 });
          setTimeout(() => {
            const prevCell = cellRefs.current.get(
              `${row - 1}-${placeType.elements.length - 1}`,
            );
            prevCell?.focus();
          }, 0);
        }
      } else if (col < placeType.elements.length - 1) {
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
      // Enter editing mode
      setEditingCell({ row, col });
      setEditingValue(String(tableData[row]?.[col] ?? 0));
      // Focus the input after state update
      setTimeout(() => inputRef.current?.focus(), 0);
    } else if (event.key === "Delete") {
      event.preventDefault();
      if (selectedRow !== null) {
        // Delete the entire row if row is selected
        removeRow(selectedRow);
      } else {
        // Clear the cell value and enter edit mode
        updateCell(row, col, 0);
        setEditingCell({ row, col });
        setEditingValue("");
        // Focus the input after state update
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    } else if (event.key === "Backspace") {
      event.preventDefault();
      // Clear the cell value and enter edit mode
      updateCell(row, col, 0);
      setEditingCell({ row, col });
      setEditingValue("");
      // Focus the input after state update
      setTimeout(() => inputRef.current?.focus(), 0);
    } else if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      event.key.length === 1
    ) {
      // Start editing with the typed character
      event.preventDefault();
      setEditingCell({ row, col });
      setEditingValue(event.key);
      // Focus the input after state update
      setTimeout(() => inputRef.current?.focus(), 0);
    } else if (event.key === "Escape") {
      event.preventDefault();
      // Unselect the cell and blur the element
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
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      !hasSimulation
    ) {
      event.preventDefault();
      event.stopPropagation();
      removeRow(rowIndex);
    } else if (event.key === "Enter" && !hasSimulation) {
      event.preventDefault();
      event.stopPropagation();
      // Focus the first cell of the selected row
      setSelectedRow(null);
      setFocusedCell({ row: rowIndex, col: 0 });
      setTimeout(() => {
        const firstCell = cellRefs.current.get(`${rowIndex}-0`);
        firstCell?.focus();
      }, 0);
    } else if (event.key === "ArrowRight" && !hasSimulation) {
      event.preventDefault();
      event.stopPropagation();
      // Focus the first cell of the selected row
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
      // Focus the next row number cell
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
      // Focus the previous row number cell
      const prevRowCell = document.querySelector(
        `td[data-row="${rowIndex - 1}"]`,
      );
      if (prevRowCell instanceof HTMLElement) {
        prevRowCell.focus();
      }
    }
  };

  const columnWidth = Math.max(60, 100 / placeType.elements.length);

  return (
    <div>
      <div className={headerRowStyle}>
        <div className={headerLabelStyle}>
          {isSimulationNotRun ? "Initial State" : "State"}
          {isSimulationNotRun && (
            <InfoIconTooltip tooltip="To delete an existing row, click its number in the left-most cell and press delete on your keyboard." />
          )}
        </div>
        {isSimulationNotRun && tableData.length > 0 && (
          <button
            type="button"
            onClick={clearState}
            className={clearButtonStyle}
          >
            <TbTrash size={12} color="#a72b2bff" />
            Clear state
          </button>
        )}
      </div>
      <div
        ref={containerRef}
        className={tableContainerStyle}
        style={{ height: `${height}px` }}
      >
        <table className={tableStyle}>
          <thead>
            <tr>
              <th aria-label="Row number" className={rowNumberHeaderStyle} />
              {placeType.elements.map((element) => (
                <th
                  key={element.elementId}
                  className={columnHeaderStyle}
                  style={{
                    width: `${columnWidth}%`,
                    maxWidth: `${columnWidth}%`,
                  }}
                >
                  {element.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(() => {
              // Show an empty row at the bottom for new entries only when editable
              const displayRows = hasSimulation
                ? tableData
                : [
                    ...tableData,
                    Array(placeType.elements.length).fill(0) as number[],
                  ];
              return displayRows.map((row, rowIndex) => (
                <tr
                  // eslint-disable-next-line react/no-array-index-key -- Row position is stable and meaningful
                  key={`row-${rowIndex}-${row.join("-")}`}
                  className={rowStyle({ isSelected: selectedRow === rowIndex })}
                >
                  <td
                    data-row={rowIndex}
                    onClick={() => handleRowClick(rowIndex)}
                    onKeyDown={(event) => handleRowKeyDown(event, rowIndex)}
                    tabIndex={0}
                    className={rowNumberCellStyle({
                      isSelected: selectedRow === rowIndex,
                      isPhantom: rowIndex === tableData.length,
                      hasSimulation,
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
                    const isPhantomRow = rowIndex === tableData.length;

                    return (
                      <td
                        // eslint-disable-next-line react/no-array-index-key -- Column position is stable and meaningful
                        key={`cell-${rowIndex}-${colIndex}`}
                        className={cellContainerStyle}
                        style={{ width: `${columnWidth}%` }}
                      >
                        {hasSimulation ? (
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
                              // Save on blur
                              const val = Number.parseFloat(editingValue) || 0;
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
                              setFocusedCell({ row: rowIndex, col: colIndex });
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
              ));
            })()}
          </tbody>
        </table>
        <button
          type="button"
          aria-label="Resize table"
          onMouseDown={startResize}
          className={resizeHandleStyle({ isResizing })}
        />
      </div>
    </div>
  );
};
