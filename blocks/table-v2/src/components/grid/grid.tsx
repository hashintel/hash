import { DataEditor, DataEditorProps } from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { useRenderGridPortal } from "./use-render-grid-portal";

type GridProps = DataEditorProps;

export const Grid = (props: GridProps) => {
  useRenderGridPortal();

  return (
    <DataEditor
      {...props}
      width="100%"
      headerHeight={40}
      rowHeight={40}
      smoothScrollX
      smoothScrollY
      getCellsForSelection
      keybindings={{ search: true }}
    />
  );
};
