import "@glideapps/glide-data-grid/dist/index.css";

import {
  CompactSelection,
  DataEditor,
  DataEditorProps,
  DataEditorRef,
  GridCell,
  GridColumn,
  GridMouseEventArgs,
  GridSelection,
  Item,
  SizedGridColumn,
  Theme,
} from "@glideapps/glide-data-grid";
import { useTheme } from "@mui/material";
import { uniqueId } from "lodash";
import { Ref, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getCellHorizontalPadding } from "./utils";
import { customGridIcons } from "./utils/custom-grid-icons";
import { InteractableManager } from "./utils/interactable-manager";
import { overrideCustomRenderers } from "./utils/override-custom-renderers";
import { Rows } from "./utils/rows";
import {
  ColumnSort,
  createHandleHeaderClicked,
  defaultSortRows,
} from "./utils/sorting";
import { useDrawHeader } from "./utils/use-draw-header";
import { useRenderGridPortal } from "./utils/use-render-grid-portal";

export type GridProps<T> = Omit<
  DataEditorProps,
  | "onColumnResize"
  | "onColumnResizeEnd"
  | "onColumnResizeStart"
  | "columns"
  | "getCellContent"
  | "rows"
  | "onCellEdited"
> & {
  columns: SizedGridColumn[];
  rows: T;
  resizable?: boolean;
  sortable?: boolean;
  initialColumnSort?: ColumnSort<string>;
  gridRef?: Ref<DataEditorRef>;
  createGetCellContent: (rows: T) => (cell: Item) => GridCell;
  createOnCellEdited?: (rows: T) => DataEditorProps["onCellEdited"];
  sortRows?: (rows: T, sort: ColumnSort<string>) => T;
};

export const Grid = <T extends Rows>({
  customRenderers,
  onVisibleRegionChanged,
  drawHeader,
  columns,
  rows,
  resizable = true,
  sortable = true,
  initialColumnSort,
  createGetCellContent,
  sortRows,
  gridRef,
  createOnCellEdited,
  ...rest
}: GridProps<T>) => {
  useRenderGridPortal();

  const tableIdRef = useRef(uniqueId("grid"));
  const [columnSizes, setColumnSizes] = useState<Record<string, number>>({});

  const { palette } = useTheme();
  const [hoveredRow, setHoveredRow] = useState<number>();

  const [selection, setSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });

  useEffect(() => {
    // delete saved interactables on unmount
    const tableId = tableIdRef.current;
    return () => InteractableManager.deleteInteractables(tableId);
  }, []);

  const [columnSort, setColumnSort] = useState<ColumnSort<string>>(
    initialColumnSort ?? {
      key: columns[0]?.id ?? "",
      dir: "asc",
    },
  );

  const defaultDrawHeader = useDrawHeader(
    sortable ? columnSort : undefined,
    columns,
  );

  const handleHeaderClicked = sortable
    ? createHandleHeaderClicked(columns, columnSort, setColumnSort)
    : undefined;

  const sortedRows = useMemo(() => {
    if (!sortable) {
      return rows;
    }

    const sortRowFn = sortRows ?? defaultSortRows;

    return sortRowFn(rows, columnSort);
  }, [sortable, rows, columnSort, sortRows]);

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

  const getRowThemeOverride = useCallback<
    NonNullable<DataEditorProps["getRowThemeOverride"]>
  >(
    (row) => {
      if (row === hoveredRow) {
        return {
          bgCell: palette.gray[10],
        };
      }
    },
    [hoveredRow, palette],
  );

  const onCellSelect = ({
    location: [colIndex, rowIndex],
    kind,
  }: GridMouseEventArgs) => {
    setHoveredRow(kind === "cell" ? rowIndex : undefined);
    setSelection({
      ...selection,
      current:
        kind === "cell"
          ? {
              cell: [colIndex, rowIndex],
              range: {
                x: colIndex,
                y: rowIndex,
                width: 1,
                height: 1,
              },
              rangeStack: [],
            }
          : undefined,
    });
  };

  const overriddenCustomRenderers = useMemo(
    () => overrideCustomRenderers(customRenderers, tableIdRef),
    [customRenderers],
  );

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
      ref={gridRef}
      theme={gridTheme}
      getRowThemeOverride={getRowThemeOverride}
      gridSelection={selection}
      width="100%"
      headerHeight={42}
      rowHeight={42}
      drawFocusRing={false}
      rangeSelect="cell"
      columnSelect="none"
      smoothScrollX
      smoothScrollY
      getCellsForSelection
      onItemHovered={onCellSelect}
      onCellClicked={(_, args) => args.isTouch && onCellSelect(args)}
      customRenderers={overriddenCustomRenderers}
      onVisibleRegionChanged={handleVisibleRegionChanged}
      onColumnResize={resizable ? handleColumnResize : undefined}
      columns={resizedColumns}
      drawHeader={drawHeader ?? defaultDrawHeader}
      onHeaderClicked={handleHeaderClicked}
      getCellContent={createGetCellContent(sortedRows)}
      onCellEdited={createOnCellEdited?.(sortedRows)}
      rows={sortedRows.length}
      maxColumnWidth={1000}
      {...rest}
      /**
       * icons defined via `headerIcons` are available to be drawn using
       * glide's `spriteManager.drawSprite`,
       * which will be used to draw svg icons inside custom cells
       */
      headerIcons={customGridIcons}
    />
  );
};
