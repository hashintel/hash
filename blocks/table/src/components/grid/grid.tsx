import "@glideapps/glide-data-grid/dist/index.css";

import { DataEditor, DataEditorProps } from "@glideapps/glide-data-grid";

import { useRenderGridPortal } from "./use-render-grid-portal";

export const ROW_HEIGHT = 40;

type GridProps = DataEditorProps;

const preventBoxShadowCss = `
    input.gdg-input, textarea.gdg-input {
      box-shadow: none !important;
    }
`;

export const Grid = (props: GridProps) => {
  useRenderGridPortal();

  return (
    <>
      <DataEditor
        width="100%"
        headerHeight={ROW_HEIGHT}
        rowHeight={ROW_HEIGHT}
        smoothScrollX
        smoothScrollY
        getCellsForSelection
        keybindings={{ search: true }}
        {...props}
      />
      <style>{preventBoxShadowCss}</style>
    </>
  );
};
