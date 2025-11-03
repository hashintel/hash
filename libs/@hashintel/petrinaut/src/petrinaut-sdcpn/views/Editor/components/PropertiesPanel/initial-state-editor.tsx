import "handsontable/dist/handsontable.full.min.css";

import { HotTable } from "@handsontable/react";
import {
  CheckboxCellType,
  NumericCellType,
  registerCellType,
} from "handsontable/cellTypes";
import { useMemo, useState } from "react";

// Register Handsontable cell types
registerCellType(CheckboxCellType);
registerCellType(NumericCellType);

/**
 * InitialStateEditor - A component for editing initial tokens in a place
 */
interface InitialStateEditorProps {
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
  placeType,
}) => {
  // State for the handsontable data
  const [tableData, setTableData] = useState<(string | number)[][]>([
    Array(placeType.elements.length).fill(""),
  ]);

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
    setTableData((prev) => [
      ...prev,
      Array(placeType.elements.length).fill("") as (string | number)[],
    ]);
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
        <span>Initial State</span>
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
          height="auto"
          minRows={1}
          contextMenu
          licenseKey="non-commercial-and-evaluation"
          afterChange={(changes) => {
            if (changes) {
              setTableData((prev) => {
                const newData = [...prev];
                for (const change of changes) {
                  const [row, col, , newVal] = change as [
                    number,
                    number,
                    string | number | null,
                    string | number | null,
                  ];
                  newData[row] =
                    newData[row] ??
                    (Array(placeType.elements.length).fill("") as (
                      | string
                      | number
                    )[]);
                  newData[row] = [...newData[row]];
                  newData[row][col] = newVal ?? "";
                }
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
