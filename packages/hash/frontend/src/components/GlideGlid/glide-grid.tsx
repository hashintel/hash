import "@glideapps/glide-data-grid/dist/index.css";
import {
  DataEditor,
  DataEditorProps,
  Theme,
  DataEditorRef,
  GridColumn,
} from "@glideapps/glide-data-grid";
import { useTheme } from "@mui/material";
import {
  forwardRef,
  ForwardRefRenderFunction,
  useCallback,
  useMemo,
  useState,
} from "react";
import { getCellHorizontalPadding } from "./utils";
import { customGridIcons } from "./utils/custom-grid-icons";

interface CustomDataEditorProps {
  resizableColumns?: boolean;
}

const GlideGrid: ForwardRefRenderFunction<
  DataEditorRef,
  DataEditorProps & CustomDataEditorProps
> = ({ resizableColumns, columns, ...props }, ref) => {
  const { palette } = useTheme();
  const [cols, setCols] = useState(columns);

  const gridTheme: Partial<Theme> = useMemo(
    () => ({
      bgHeader: palette.white,
      borderColor: palette.gray[20],
      headerBottomBorderColor: palette.gray[20],
      horizontalBorderColor: "transparent",
      accentColor: palette.blue[70],
      textHeader: palette.gray[80],
      textDark: palette.gray[80],
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

  const onColumnResize = useCallback(
    (col: GridColumn, newSize: number) => {
      const index = cols.indexOf(col);
      const newCols = [...cols];
      const resizedCol = newCols[index];

      if (resizedCol) {
        newCols[index] = {
          ...resizedCol,
          width: newSize,
        };
      }
      setCols(newCols);
    },
    [cols],
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
      columns={cols}
      onColumnResize={resizableColumns ? onColumnResize : undefined}
      {...props}
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
