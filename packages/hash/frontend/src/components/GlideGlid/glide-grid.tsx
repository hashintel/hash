import {
  DataEditor,
  DataEditorProps,
  Theme,
  DataEditorRef,
} from "@glideapps/glide-data-grid";
import { useTheme } from "@mui/material";
import { forwardRef, ForwardRefRenderFunction, useMemo } from "react";

const _GlideGrid: ForwardRefRenderFunction<DataEditorRef, DataEditorProps> = (
  props,
  ref,
) => {
  const { palette } = useTheme();

  const gridTheme: Partial<Theme> = useMemo(
    () => ({
      bgHeader: "white",
      borderColor: palette.gray[20],
      headerBottomBorderColor: palette.gray[20],
      horizontalBorderColor: "transparent",
      accentColor: palette.blue[70],
      textHeader: palette.gray[80],
      bgHeaderHasFocus: "transparent",
      textBubble: palette.gray[70],
      bgBubble: palette.gray[20],
      accentLight: palette.gray[20],
      bgHeaderHovered: "white",
      cellHorizontalPadding: 22,
      baseFontStyle: "500 14px",
      headerFontStyle: "600 14px",
      editorFontSize: "14px",
    }),
    [palette],
  );

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
      {...props}
    />
  );
};

export const GlideGrid = forwardRef(_GlideGrid);
