import "@glideapps/glide-data-grid/dist/index.css";
import {
  DataEditor,
  DataEditorProps,
  Theme,
  DataEditorRef,
  Item,
} from "@glideapps/glide-data-grid";
import { useTheme } from "@mui/material";
import { forwardRef, ForwardRefRenderFunction, useMemo, useState } from "react";
import { uniqueId } from "lodash";
import { getCellHorizontalPadding } from "./utils";
import { customGridIcons } from "./utils/custom-grid-icons";
import { InteractableManager } from "./utils/interactable-manager";

const GlideGrid: ForwardRefRenderFunction<DataEditorRef, DataEditorProps> = (
  { customRenderers, ...rest },
  ref,
) => {
  const [tableId] = useState(uniqueId("grid"));

  const { palette } = useTheme();

  const gridTheme: Partial<Theme> = useMemo(
    () => ({
      bgHeader: palette.white,
      borderColor: palette.gray[20],
      headerBottomBorderColor: palette.gray[20],
      horizontalBorderColor: "transparent",
      accentColor: palette.blue[70],
      textHeader: palette.gray[80],
      bgHeaderHasFocus: "transparent",
      textBubble: palette.gray[70],
      bgBubble: palette.gray[20],
      accentLight: "transparent", // cell highlight color
      bgHeaderHovered: palette.white,
      cellHorizontalPadding: getCellHorizontalPadding(),
      baseFontStyle: "500 14px Inter",
      headerFontStyle: "600 14px Inter",
      editorFontSize: "14px",
      fgIconHeader: palette.gray[80],
    }),
    [palette],
  );

  const interactableCustomRenderers = useMemo<
    DataEditorProps["customRenderers"]
  >(() => {
    return customRenderers?.map((customRenderer) => {
      return {
        ...customRenderer,
        draw: (args, cell) => customRenderer.draw({ ...args, tableId }, cell),
        onClick: (args) => {
          /** @todo investigate why `args` don't have `location` in it's type  */
          const [col, row] = (args as unknown as { location: Item }).location;

          const isClickHandledByManager = InteractableManager.handleClick(
            `${tableId}-${col}-${row}`,
            args,
          );

          if (isClickHandledByManager) {
            args.preventDefault();
          } else {
            customRenderer.onClick?.(args);
          }

          return undefined;
        },
      };
    });
  }, [customRenderers, tableId]);

  return (
    <DataEditor
      ref={ref}
      theme={gridTheme}
      width="100%"
      headerHeight={42}
      rowHeight={42}
      drawFocusRing={false}
      rangeSelect="cell"
      columnSelect="none"
      smoothScrollX
      smoothScrollY
      getCellsForSelection
      customRenderers={interactableCustomRenderers}
      {...rest}
      /**
       * icons defined via `headerIcons` are avaiable to be drawn using
       * glide-grid's `spriteManager.drawSprite`,
       * which will be used to draw svg icons inside custom cells
       */
      headerIcons={customGridIcons}
    />
  );
};

const GlideGridForwardRef = forwardRef(GlideGrid);

export { GlideGridForwardRef as GlideGrid };
