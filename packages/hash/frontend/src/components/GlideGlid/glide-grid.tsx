import "@glideapps/glide-data-grid/dist/index.css";
import {
  DataEditor,
  DataEditorProps,
  Theme,
  DataEditorRef,
  Item,
  GridColumn,
  SizedGridColumn,
} from "@glideapps/glide-data-grid";
import { useTheme } from "@mui/material";
import {
  forwardRef,
  ForwardRefRenderFunction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { uniqueId } from "lodash";
import { getCellHorizontalPadding } from "./utils";
import { customGridIcons } from "./utils/custom-grid-icons";
import { InteractableManager } from "./utils/interactable-manager";

type GlideGridProps = Omit<
  DataEditorProps,
  "onColumnResize" | "onColumnResizeEnd" | "onColumnResizeStart" | "columns"
> & {
  resizable?: boolean;
  columns: SizedGridColumn[];
};

const GlideGrid: ForwardRefRenderFunction<DataEditorRef, GlideGridProps> = (
  {
    customRenderers,
    onVisibleRegionChanged,
    columns,
    resizable = true,
    ...rest
  },
  ref,
) => {
  const tableIdRef = useRef(uniqueId("grid"));
  const [columnSizes, setColumnSizes] = useState<Record<string, number>>({});

  const { palette } = useTheme();

  useEffect(() => {
    // delete saved interactables on unmount
    const tableId = tableIdRef.current;
    return () => InteractableManager.deleteInteractables(tableId);
  }, []);

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
        draw: (args, cell) =>
          customRenderer.draw({ ...args, tableId: tableIdRef.current }, cell),
        onClick: (args) => {
          /** @todo investigate why `args` don't have `location` in it's type  */
          const [col, row] = (args as unknown as { location: Item }).location;

          const wasClickHandledByManager = InteractableManager.handleClick(
            `${tableIdRef.current}-${col}-${row}`,
            args,
          );

          if (wasClickHandledByManager) {
            args.preventDefault();
          } else {
            customRenderer.onClick?.(args);
          }

          return undefined;
        },
      };
    });
  }, [customRenderers]);

  const handleVisibleRegionChanged = useCallback<
    NonNullable<DataEditorProps["onVisibleRegionChanged"]>
  >(
    (...args) => {
      const range = args[0];
      const deleteBeforeRow = range.y;
      const deleteAfterRow = range.y + range.height;

      InteractableManager.deleteInteractables(tableIdRef.current, {
        deleteBeforeRow,
        deleteAfterRow,
      });

      onVisibleRegionChanged?.(...args);
    },
    [onVisibleRegionChanged],
  );

  const handleColumnResize = useCallback(
    (column: GridColumn, newSize: number) => {
      setColumnSizes((prevColumnSizes) => {
        return {
          ...prevColumnSizes,
          [column.id]: newSize,
        };
      });
    },
    [],
  );

  const resizedColumns = useMemo<GridColumn[]>(() => {
    return columns.map((col) => {
      return { ...col, width: columnSizes[col.id] ?? col.width };
    });
  }, [columns, columnSizes]);

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
      onVisibleRegionChanged={handleVisibleRegionChanged}
      onColumnResize={resizable ? handleColumnResize : undefined}
      columns={resizedColumns}
      {...rest}
      /**
       * icons defined via `headerIcons` are available to be drawn using
       * glide-grid's `spriteManager.drawSprite`,
       * which will be used to draw svg icons inside custom cells
       */
      headerIcons={customGridIcons}
    />
  );
};

const GlideGridForwardRef = forwardRef(GlideGrid);

export { GlideGridForwardRef as GlideGrid };
