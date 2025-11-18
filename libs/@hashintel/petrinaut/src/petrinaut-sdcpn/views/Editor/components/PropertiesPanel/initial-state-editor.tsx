import { useEffect, useRef, useState } from "react";

import { useSimulationStore } from "../../../../state/simulation-provider";

/**
 * InitialStateEditor - A component for editing initial tokens in a place
 * Stores data in SimulationStore, not in the Place definition
 */
interface InitialStateEditorProps {
  placeId: string;
  placeType: {
    id: string;
    name: string;
    elements: {
      id: string;
      name: string;
      type: "real" | "integer" | "boolean";
    }[];
  };
}

export const InitialStateEditor: React.FC<InitialStateEditorProps> = ({
  placeId,
  placeType,
}) => {
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
    return [Array(placeType.elements.length).fill(0)];
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
    if (currentMarking && currentMarking.count > 0) {
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
      const newData = prev.map((rowData, index) =>
        index === row ? [...rowData] : rowData,
      );
      if (newData[row]) {
        newData[row][col] = value;
      }
      saveToStore(newData);
      return newData;
    });
  };

  const addRow = () => {
    setTableData((prev) => {
      const newData: number[][] = [
        ...prev,
        Array(placeType.elements.length).fill(0) as number[],
      ];
      saveToStore(newData);
      return newData;
    });
  };

  const removeRow = (rowIndex: number) => {
    if (tableData.length === 1) {
      // Don't remove the last row, just reset it
      const newData: number[][] = [
        Array(placeType.elements.length).fill(0) as number[],
      ];
      setTableData(newData);
      saveToStore(newData);
    } else {
      setTableData((prev) => {
        const newData: number[][] = prev.filter(
          (_, index) => index !== rowIndex,
        );
        saveToStore(newData);
        return newData;
      });
    }
    setSelectedRow(null);
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
        // Save the value and exit editing mode
        const value = Number.parseFloat(editingValue) || 0;
        updateCell(row, col, value);
        setEditingCell(null);
        setEditingValue("");
      } else if (event.key === "Tab") {
        event.preventDefault();
        // Save the value and move to next cell
        const value = Number.parseFloat(editingValue) || 0;
        updateCell(row, col, value);
        setEditingCell(null);
        setEditingValue("");

        // Move to next cell (right, or wrap to next row)
        if (col < placeType.elements.length - 1) {
          setFocusedCell({ row, col: col + 1 });
          setTimeout(() => {
            const nextCell = cellRefs.current.get(`${row}-${col + 1}`);
            nextCell?.focus();
          }, 0);
        } else if (row < tableData.length - 1) {
          setFocusedCell({ row: row + 1, col: 0 });
          setTimeout(() => {
            const nextCell = cellRefs.current.get(`${row + 1}-0`);
            nextCell?.focus();
          }, 0);
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        // Cancel editing
        setEditingCell(null);
        setEditingValue("");
      }
      return;
    }

    // Navigation keys when not editing
    if (event.key === "ArrowRight" && col < placeType.elements.length - 1) {
      event.preventDefault();
      setFocusedCell({ row, col: col + 1 });
      setTimeout(() => {
        const nextCell = cellRefs.current.get(`${row}-${col + 1}`);
        nextCell?.focus();
      }, 0);
    } else if (event.key === "ArrowLeft" && col > 0) {
      event.preventDefault();
      setFocusedCell({ row, col: col - 1 });
      setTimeout(() => {
        const prevCell = cellRefs.current.get(`${row}-${col - 1}`);
        prevCell?.focus();
      }, 0);
    } else if (event.key === "ArrowDown" && row < tableData.length - 1) {
      event.preventDefault();
      setFocusedCell({ row: row + 1, col });
      setTimeout(() => {
        const nextCell = cellRefs.current.get(`${row + 1}-${col}`);
        nextCell?.focus();
      }, 0);
    } else if (event.key === "ArrowUp" && row > 0) {
      event.preventDefault();
      setFocusedCell({ row: row - 1, col });
      setTimeout(() => {
        const prevCell = cellRefs.current.get(`${row - 1}-${col}`);
        prevCell?.focus();
      }, 0);
    } else if (event.key === "Tab") {
      event.preventDefault();
      // Move to next cell (right, or wrap to next row)
      if (col < placeType.elements.length - 1) {
        setFocusedCell({ row, col: col + 1 });
        setTimeout(() => {
          const nextCell = cellRefs.current.get(`${row}-${col + 1}`);
          nextCell?.focus();
        }, 0);
      } else if (row < tableData.length - 1) {
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
    }
  };

  const handleRowClick = (rowIndex: number) => {
    setSelectedRow(rowIndex);
  };

  const handleRowKeyDown = (event: React.KeyboardEvent, rowIndex: number) => {
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      !hasSimulation
    ) {
      event.preventDefault();
      event.stopPropagation();
      removeRow(rowIndex);
    } else if (event.key === "ArrowDown" && rowIndex < tableData.length - 1) {
      event.preventDefault();
      event.stopPropagation();
      setSelectedRow(rowIndex + 1);
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
      <div
        style={{
          fontWeight: 500,
          fontSize: 12,
          marginBottom: 4,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>{isSimulationNotRun ? "Initial State" : "State"}</span>
        {!hasSimulation && (
          <button
            type="button"
            onClick={addRow}
            style={{
              fontSize: 11,
              padding: "2px 8px",
              border: "1px solid rgba(0, 0, 0, 0.2)",
              borderRadius: 3,
              backgroundColor: "white",
              cursor: "pointer",
            }}
          >
            + Add Row
          </button>
        )}
      </div>
      <div
        style={{
          border: "1px solid rgba(0, 0, 0, 0.1)",
          borderRadius: 4,
          overflow: "auto",
          width: "100%",
          maxHeight: 250,
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
            tableLayout: "fixed",
          }}
        >
          <thead>
            <tr>
              <th
                aria-label="Row number"
                style={{
                  position: "sticky",
                  top: 0,
                  backgroundColor: "#f5f5f5",
                  borderBottom: "1px solid rgba(0, 0, 0, 0.1)",
                  borderRight: "1px solid rgba(0, 0, 0, 0.1)",
                  padding: "4px 8px",
                  textAlign: "center",
                  fontWeight: 500,
                  width: 40,
                  minWidth: 40,
                }}
              />
              {placeType.elements.map((element) => (
                <th
                  key={element.id}
                  style={{
                    position: "sticky",
                    top: 0,
                    backgroundColor: "#f5f5f5",
                    borderBottom: "1px solid rgba(0, 0, 0, 0.1)",
                    padding: "4px 8px",
                    textAlign: "left",
                    fontWeight: 500,
                    fontFamily: "monospace",
                    width: `${columnWidth}%`,
                    minWidth: "60px",
                    maxWidth: `${columnWidth}%`,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {element.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableData.map((row, rowIndex) => (
              <tr
                // eslint-disable-next-line react/no-array-index-key -- Row position is stable and meaningful
                key={`row-${rowIndex}-${row.join("-")}`}
                style={{
                  backgroundColor:
                    selectedRow === rowIndex
                      ? "rgba(59, 130, 246, 0.1)"
                      : "transparent",
                }}
              >
                <td
                  data-row={rowIndex}
                  onClick={() => handleRowClick(rowIndex)}
                  onKeyDown={(event) => handleRowKeyDown(event, rowIndex)}
                  tabIndex={0}
                  style={{
                    borderRight: "1px solid rgba(0, 0, 0, 0.1)",
                    borderBottom: "1px solid rgba(0, 0, 0, 0.05)",
                    padding: "4px 8px",
                    textAlign: "center",
                    cursor: hasSimulation ? "default" : "pointer",
                    backgroundColor: "#fafafa",
                    fontWeight: 500,
                    color: "#666",
                  }}
                >
                  {rowIndex + 1}
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
                      style={{
                        borderBottom: "1px solid rgba(0, 0, 0, 0.05)",
                        padding: 0,
                        width: `${columnWidth}%`,
                      }}
                    >
                      {hasSimulation ? (
                        <div
                          style={{
                            fontFamily: "monospace",
                            fontSize: 12,
                            padding: "4px 8px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {value}
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
                          style={{
                            width: "100%",
                            border: "none",
                            padding: "4px 8px",
                            fontFamily: "monospace",
                            fontSize: 12,
                            backgroundColor: "rgba(59, 130, 246, 0.05)",
                            outline: "2px solid #3b82f6",
                            outlineOffset: -2,
                            boxSizing: "border-box",
                          }}
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
                          onFocus={() =>
                            setFocusedCell({ row: rowIndex, col: colIndex })
                          }
                          onKeyDown={(event) =>
                            handleKeyDown(event, rowIndex, colIndex)
                          }
                          style={{
                            width: "100%",
                            padding: "4px 8px",
                            fontFamily: "monospace",
                            fontSize: 12,
                            backgroundColor: "transparent",
                            outline: isFocused ? "2px solid #3b82f6" : "none",
                            outlineOffset: -2,
                            cursor: "default",
                            boxSizing: "border-box",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {value}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
