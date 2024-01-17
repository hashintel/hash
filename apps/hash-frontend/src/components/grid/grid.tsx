import "@glideapps/glide-data-grid/dist/index.css";

import {
  CompactSelection,
  DataEditor,
  DataEditorProps,
  DataEditorRef,
  GridCell,
  GridCellKind,
  GridColumn,
  GridMouseEventArgs,
  GridSelection,
  HeaderClickedEventArgs,
  Item,
  SizedGridColumn,
  TextCell,
  Theme,
} from "@glideapps/glide-data-grid";
import { Box, PopperProps, useTheme } from "@mui/material";
import type { Instance as PopperInstance } from "@popperjs/core";
import { uniqueId } from "lodash";
import { Ref, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getCellHorizontalPadding } from "./utils";
import { ColumnFilterMenu } from "./utils/column-filter-menu";
import { customGridIcons } from "./utils/custom-grid-icons";
import { ColumnFilter } from "./utils/filtering";
import { InteractableManager } from "./utils/interactable-manager";
import {
  ColumnHeaderPath,
  Interactable,
} from "./utils/interactable-manager/types";
import { overrideCustomRenderers } from "./utils/override-custom-renderers";
import { Row } from "./utils/rows";
import { ColumnSort, defaultSortRows } from "./utils/sorting";
import { useDrawHeader } from "./utils/use-draw-header";
import { useRenderGridPortal } from "./utils/use-render-grid-portal";

export type GridProps<T extends Row & { rowId: string }> = Omit<
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
  columnFilters?: ColumnFilter<string, T>[];
  enableCheckboxSelection?: boolean;
  selectedRows?: T[];
  onSelectedRowsChange?: (selectedRows: T[]) => void;
  rows?: T[];
  resizable?: boolean;
  sortable?: boolean;
  initialSortedColumnKey?: string;
  firstColumnLeftPadding?: number;
  gridRef?: Ref<DataEditorRef>;
  createGetCellContent: (rows: T[]) => (cell: Item) => GridCell;
  createOnCellEdited?: (rows: T[]) => DataEditorProps["onCellEdited"];
  sortRows?: (rows: T[], sort: ColumnSort<string>) => T[];
};

const gridHeaderHeight = 42;

export const gridHeaderHeightWithBorder = gridHeaderHeight + 1;

export const gridRowHeight = 42;

export const gridHorizontalScrollbarHeight = 17;

export const Grid = <T extends Row & { rowId: string }>({
  customRenderers,
  onVisibleRegionChanged,
  drawHeader,
  columns,
  rows,
  firstColumnLeftPadding,
  enableCheckboxSelection = false,
  resizable = true,
  sortable = true,
  columnFilters,
  initialSortedColumnKey,
  createGetCellContent,
  sortRows,
  gridRef,
  createOnCellEdited,
  selectedRows,
  onSelectedRowsChange,
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

  const [sorts, setSorts] = useState<ColumnSort<string>[]>(
    columns.map((column) => ({
      columnKey: column.id,
      direction: "asc",
    })),
  );

  const [currentSortedColumnKey, setCurrentSortedColumnKey] = useState<
    string | undefined
  >(initialSortedColumnKey ?? columns[0]?.id);

  const [openFilterColumnKey, setOpenFilterColumnKey] = useState<string>();

  const handleSortClick = useCallback(
    (columnKey: string) => {
      if (currentSortedColumnKey === columnKey) {
        // Toggle the direction of the sort if it's already the currently sorted column
        setSorts((prevSorts) => {
          const previousSortIndex = prevSorts.findIndex(
            (sort) => sort.columnKey === columnKey,
          );

          const previousSort = prevSorts[previousSortIndex]!;

          return [
            ...prevSorts.slice(0, previousSortIndex),
            {
              ...previousSort,
              direction: previousSort.direction === "asc" ? "desc" : "asc",
            },
            ...prevSorts.slice(previousSortIndex + 1),
          ];
        });
      }

      setCurrentSortedColumnKey(columnKey);
    },
    [currentSortedColumnKey],
  );

  const handleFilterClick = useCallback((columnKey: string) => {
    setOpenFilterColumnKey(columnKey);
  }, []);

  const defaultDrawHeader = useDrawHeader({
    tableId: tableIdRef.current,
    sorts,
    activeSortColumnKey: currentSortedColumnKey,
    onSortClick: handleSortClick,
    filters: columnFilters,
    onFilterClick: handleFilterClick,
    columns,
    firstColumnLeftPadding,
  });

  const handleHeaderClicked = useCallback(
    (colIndex: number, event: HeaderClickedEventArgs) => {
      const columnHeaderPath: ColumnHeaderPath = `${tableIdRef.current}-${colIndex}`;

      /**
       * When the header is clicked, we need to notify the interactable manager
       * so that the relevant interactables can be notified of the click.
       */
      InteractableManager.handleClick(columnHeaderPath, {
        posX: event.localEventX,
        posY: event.localEventY,
      });
    },
    [],
  );

  const filteredRows = useMemo<T[] | undefined>(() => {
    if (rows) {
      if (!columnFilters) {
        return rows;
      }

      return rows.filter((row) => {
        for (const columnFilter of columnFilters) {
          if (columnFilter.isRowFiltered(row)) {
            return false;
          }
        }
        return true;
      });
    }
  }, [rows, columnFilters]);

  const sortedRows = useMemo<T[] | undefined>(() => {
    if (filteredRows) {
      if (!sortable) {
        return filteredRows;
      }

      const sortedColumn = currentSortedColumnKey
        ? sorts.find((sort) => sort.columnKey === currentSortedColumnKey)
        : undefined;

      if (!sortedColumn) {
        return filteredRows;
      }

      const sortRowFn = sortRows ?? defaultSortRows;

      return sortRowFn(filteredRows, sortedColumn);
    }
  }, [sortable, filteredRows, sortRows, currentSortedColumnKey, sorts]);

  const gridSelection = useMemo(() => {
    if (sortedRows && selectedRows) {
      let mergedRowSelection = CompactSelection.empty();

      for (const selectedRow of selectedRows) {
        const selectedRowIndex = sortedRows.findIndex(
          (row) => row.rowId === selectedRow.rowId,
        );

        mergedRowSelection = mergedRowSelection.add(selectedRowIndex);
      }

      return {
        ...selection,
        rows: mergedRowSelection,
      };
    }

    return selection;
  }, [selection, sortedRows, selectedRows]);

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

  const resizedColumns = useMemo<(GridColumn & { width: number })[]>(() => {
    return columns.map((col) => {
      return { ...col, width: columnSizes[col.id] ?? col.width };
    });
  }, [columns, columnSizes]);

  const getSkeletonCellContent = useCallback(
    ([colIndex]: Item): TextCell => ({
      kind: GridCellKind.Text,
      displayData: colIndex === 0 ? "Loading..." : "",
      data: colIndex === 0 ? "Loading..." : "",
      allowOverlay: false,
      themeOverride: {
        cellHorizontalPadding: 15,
      },
      style: "faded",
    }),
    [],
  );

  const wrapperRef = useRef<HTMLDivElement>(null);
  const scrollWrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!scrollWrapperRef.current) {
      const setScrollWrapperState = () => {
        if (wrapperRef.current) {
          const mountedScrollWrapper =
            wrapperRef.current.querySelector(".dvn-scroller");

          if (mountedScrollWrapper) {
            scrollWrapperRef.current = mountedScrollWrapper as HTMLDivElement;
          } else if (!scrollWrapperRef.current) {
            setTimeout(() => {
              setScrollWrapperState();
            }, 50);
          }
        }
      };

      setScrollWrapperState();
    }
  }, []);

  const popperRef = useRef<PopperInstance>(null);

  const openFilterColumn = useMemo(
    () =>
      openFilterColumnKey
        ? columnFilters?.find(
            ({ columnKey }) => columnKey === openFilterColumnKey,
          )
        : undefined,
    [openFilterColumnKey, columnFilters],
  );

  const previousInteractableRef = useRef<Interactable | null>(null);

  const filterIconVirtualElement = useMemo<PopperProps["anchorEl"]>(
    () => ({
      getBoundingClientRect: () => {
        const columnIndex = columns.findIndex(
          ({ id }) => id === openFilterColumnKey,
        );

        /**
         * We need to obtain the most recent version of the interactable,
         * as the user might have scrolled horizontally since the last
         * call to `getBoundingClientRect`.
         */
        const interactable =
          InteractableManager.getInteractable(
            `${tableIdRef.current}-${columnIndex}`,
            `column-filter-${openFilterColumnKey}`,
          ) ?? previousInteractableRef.current;

        /**
         * When the user clicks away from the popover, briefly the `interactable`
         * is set to `undefined` causing the popover to jump position. This is
         * a quick fix for this.
         *
         * @todo: figure out why the `interactable` is briefly `undefined` in the
         * first place.
         */
        previousInteractableRef.current = interactable;

        if (!interactable) {
          return {
            width: 0,
            height: 0,
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
            x: 0,
            y: 0,
            toJSON: () => "",
          };
        }

        const { y: wrapperYPosition, x: wrapperXPosition } =
          wrapperRef.current!.getBoundingClientRect();

        const left = wrapperXPosition + interactable.pos.left;

        const top = interactable.pos.top + wrapperYPosition;

        return {
          width: 0,
          height: 0,
          ...interactable.pos,
          left,
          top,
          x: left,
          y: top,
          toJSON: () => "",
        };
      },
    }),
    [columns, openFilterColumnKey],
  );

  return (
    <Box
      ref={wrapperRef}
      sx={{
        position: "relative",
        borderBottomLeftRadius: "6px",
        borderBottomRightRadius: "6px",
        overflow: "hidden",
        boxShadow: "0px 1px 5px 0px rgba(27, 33, 40, 0.07)",
      }}
    >
      <ColumnFilterMenu
        open={!!openFilterColumn}
        columnFilter={openFilterColumn}
        onClose={() => setOpenFilterColumnKey(undefined)}
        anchorEl={filterIconVirtualElement}
        popperRef={popperRef}
        transition
        placement="bottom-start"
      />
      <DataEditor
        ref={gridRef}
        theme={gridTheme}
        getRowThemeOverride={getRowThemeOverride}
        gridSelection={gridSelection}
        width="100%"
        headerHeight={gridHeaderHeight}
        rowHeight={gridRowHeight}
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
        getCellContent={
          sortedRows ? createGetCellContent(sortedRows) : getSkeletonCellContent
        }
        onCellEdited={sortedRows ? createOnCellEdited?.(sortedRows) : undefined}
        rows={sortedRows ? sortedRows.length : 1}
        maxColumnWidth={1000}
        verticalBorder={
          typeof rest.verticalBorder === "undefined"
            ? (columnNumber) =>
                enableCheckboxSelection ? columnNumber !== 0 : true
            : (columnNumber) => {
                const defaultValue =
                  typeof rest.verticalBorder === "function"
                    ? rest.verticalBorder(columnNumber)
                    : rest.verticalBorder!;

                return enableCheckboxSelection
                  ? columnNumber !== 0 || defaultValue
                  : defaultValue;
              }
        }
        {...(enableCheckboxSelection
          ? {
              rowMarkers: "checkbox",
              rowSelectionMode: "multi",
              onGridSelectionChange: onSelectedRowsChange
                ? (updatedGridSelection) => {
                    updatedGridSelection.rows.toArray();

                    if (!sortedRows) {
                      return;
                    }

                    const updatedSelectedRows = sortedRows.filter(
                      (_, rowIndex) =>
                        updatedGridSelection.rows.hasIndex(rowIndex),
                    );

                    onSelectedRowsChange(updatedSelectedRows);
                  }
                : undefined,
            }
          : {})}
        {...rest}
        /**
         * icons defined via `headerIcons` are available to be drawn using
         * glide's `spriteManager.drawSprite`,
         * which will be used to draw svg icons inside custom cells
         */
        headerIcons={customGridIcons}
      />
    </Box>
  );
};
