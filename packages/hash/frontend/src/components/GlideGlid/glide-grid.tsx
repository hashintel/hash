import "@glideapps/glide-data-grid/dist/index.css";
import {
  DataEditor,
  DataEditorProps,
  Theme,
  DataEditorRef,
  Item,
  GridColumn,
  SizedGridColumn,
  GridCell,
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
import { useDrawHeader } from "./utils/use-draw-header";
import {
  createHandleHeaderClicked,
  sortRowData,
  TableSort,
} from "./utils/sorting";

export type Row = Record<string, any>;
export type RowData = Row[];

type GlideGridProps = Omit<
  DataEditorProps,
  | "onColumnResize"
  | "onColumnResizeEnd"
  | "onColumnResizeStart"
  | "columns"
  | "getCellContent"
  | "rows"
> & {
  columns: SizedGridColumn[];
  rowData: RowData;
  resizable?: boolean;
  initialPropertySort?: TableSort<string>;
  getCellContent: (rowData: any) => (cell: Item) => GridCell | undefined;
  onSort?: (rowData: RowData) => RowData;
};

const GlideGrid: ForwardRefRenderFunction<DataEditorRef, GlideGridProps> = (
  {
    customRenderers,
    onVisibleRegionChanged,
    drawHeader,
    columns,
    rowData,
    resizable = true,
    initialPropertySort,
    getCellContent,
    onSort,
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

  const [propertySort, setPropertySort] = useState<TableSort<string>>(
    initialPropertySort ?? {
      key: columns[0]?.id ?? "",
      dir: "asc",
    },
  );

  const defaultDrawHeader = useDrawHeader(propertySort, columns);

  const handleHeaderClicked = createHandleHeaderClicked(
    columns,
    propertySort,
    setPropertySort,
  );

  const sortedRowData = useMemo(() => {
    const sortedRows = sortRowData(rowData, propertySort);

    return onSort?.(sortedRows) ?? sortedRows;
  }, [rowData, propertySort, onSort]);

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
      drawHeader={drawHeader ?? defaultDrawHeader}
      onHeaderClicked={handleHeaderClicked}
      getCellContent={getCellContent(sortedRowData)}
      rows={sortedRowData.length}
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
