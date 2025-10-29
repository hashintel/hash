import "handsontable/dist/handsontable.full.min.css";

import { HotTable } from "@handsontable/react";
import {
  CheckboxCellType,
  NumericCellType,
  registerCellType,
} from "handsontable/cellTypes";
import { useEffect, useMemo, useState } from "react";

import { useSimulationStore } from "../../../../state/simulation-provider";

// Register Handsontable cell types
registerCellType(CheckboxCellType);
registerCellType(NumericCellType);

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
  const [tableData, setTableData] = useState<(string | number | boolean)[][]>(
    () => {
      if (currentMarking && currentMarking.count > 0) {
        // Convert Float64Array back to 2D array based on place type dimensions
        const dimensions = placeType.elements.length;
        const tokens: (string | number | boolean)[][] = [];
        for (let i = 0; i < currentMarking.count; i++) {
          const tokenValues: (string | number | boolean)[] = [];
          for (let colIndex = 0; colIndex < dimensions; colIndex++) {
            tokenValues.push(
              currentMarking.values[i * dimensions + colIndex] ?? "",
            );
          }
          tokens.push(tokenValues);
        }
        return tokens;
      }
      return [Array(placeType.elements.length).fill("")];
    },
  );

  // Update table data when marking changes externally
  useEffect(() => {
    if (currentMarking && currentMarking.count > 0) {
      const dimensions = placeType.elements.length;
      const tokens: (string | number | boolean)[][] = [];
      for (let i = 0; i < currentMarking.count; i++) {
        const tokenValues: (string | number | boolean)[] = [];
        for (let colIndex = 0; colIndex < dimensions; colIndex++) {
          tokenValues.push(
            currentMarking.values[i * dimensions + colIndex] ?? "",
          );
        }
        tokens.push(tokenValues);
      }
      setTableData(tokens);
    }
  }, [currentMarking, placeType.elements.length]);

  // Convert table data to Float64Array and save to simulation store
  const saveToStore = (data: (string | number | boolean)[][]) => {
    const dimensions = placeType.elements.length;
    const count = data.length;
    const values = new Float64Array(count * dimensions);

    for (let i = 0; i < count; i++) {
      for (let col = 0; col < dimensions; col++) {
        const val = data[i]?.[col];
        // Convert to number - booleans become 1/0, strings are parsed
        if (typeof val === "boolean") {
          values[i * dimensions + col] = val ? 1 : 0;
        } else if (typeof val === "number") {
          values[i * dimensions + col] = val;
        } else if (typeof val === "string") {
          values[i * dimensions + col] = Number.parseFloat(val) || 0;
        } else {
          values[i * dimensions + col] = 0;
        }
      }
    }

    setInitialMarking(placeId, { values, count });
  };

  const columns = useMemo(
    () =>
      placeType.elements.map((element, index) => ({
        data: index,
        title: element.name,
        type: element.type === "boolean" ? "checkbox" : "numeric",
      })),
    [placeType.elements],
  );

  const addRow = () => {
    setTableData((prev) => {
      const newData = [
        ...prev,
        Array(placeType.elements.length).fill("") as (
          | string
          | number
          | boolean
        )[],
      ];
      saveToStore(newData);
      return newData;
    });
  };

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
        <span>State</span>
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
          overflow: "hidden",
          minHeight: 150,
        }}
      >
        <HotTable
          data={tableData}
          colHeaders={placeType.elements.map((el) => el.name)}
          rowHeaders
          width="100%"
          height="auto"
          stretchH="all"
          minRows={1}
          autoWrapCol
          contextMenu={!hasSimulation}
          readOnly={hasSimulation}
          licenseKey="non-commercial-and-evaluation"
          afterChange={(changes) => {
            if (changes && !hasSimulation) {
              setTableData((prev) => {
                const newData = [...prev];
                for (const change of changes) {
                  const [row, col, , newVal] = change as [
                    number,
                    number,
                    string | number | boolean | null,
                    string | number | boolean | null,
                  ];
                  newData[row] =
                    newData[row] ??
                    (Array(placeType.elements.length).fill("") as (
                      | string
                      | number
                      | boolean
                    )[]);
                  newData[row] = [...newData[row]];
                  newData[row][col] = newVal ?? "";
                }
                // Persist to simulation store after all changes
                saveToStore(newData);
                return newData;
              });
            }
          }}
          columns={columns}
        />
      </div>
    </div>
  );
};
