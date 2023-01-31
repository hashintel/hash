import {
  DataEditor,
  DataEditorProps,
  GridSelection,
  CompactSelection,
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { useRenderGridPortal } from "./use-render-grid-portal";
import { useState } from "react";

type GridProps = DataEditorProps;

export const Grid = (props: GridProps) => {
  useRenderGridPortal();

  const [selection, setSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });

  return (
    <DataEditor
      {...props}
      width="100%"
      headerHeight={40}
      rowHeight={40}
      columnSelect="none"
      smoothScrollX
      smoothScrollY
      getCellsForSelection
      gridSelection={selection}
      onGridSelectionChange={(newSelection) => setSelection(newSelection)}
      keybindings={{ search: true }}
      getRowThemeOverride={(rowIndex) => {
        const selectedRowIndex = selection.current?.cell[1];

        if (rowIndex === selectedRowIndex) {
          return { bgCell: "#f4f4f4" };
        }
      }}
    />
  );
};
