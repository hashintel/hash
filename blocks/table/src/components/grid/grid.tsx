import { DataEditor, DataEditorProps } from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { useRenderGridPortal } from "./use-render-grid-portal";

export const ROW_HEIGHT = 40;

type GridProps = DataEditorProps;

export const Grid = (props: GridProps) => {
  useRenderGridPortal();

  return (
    <DataEditor
      width="100%"
      headerHeight={ROW_HEIGHT}
      rowHeight={ROW_HEIGHT}
      smoothScrollX
      smoothScrollY
      getCellsForSelection
      keybindings={{ search: true }}
      height={(props.rows + 2) * ROW_HEIGHT}
      {...props}
    />
  );
};
