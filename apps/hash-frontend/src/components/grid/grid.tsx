import "@glideapps/glide-data-grid/dist/index.css";

import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";
import type {
  DataEditorProps,
  DataEditorRef,
  GridCell,
  GridColumn as LibraryGridColumn,
  GridSelection,
  HeaderClickedEventArgs,
  Item,
  SizedGridColumn,
  TextCell,
  Theme,
} from "@glideapps/glide-data-grid";
import {
  CompactSelection,
  DataEditor,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import { gridRowHeight } from "@local/hash-isomorphic-utils/data-grid";
import type { PopperProps } from "@mui/material";
import { Box, useTheme } from "@mui/material";
import type {
  Instance as PopperInstance,
  VirtualElement,
} from "@popperjs/core";
import { uniqueId } from "lodash";
import type { MutableRefObject, Ref } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getCellHorizontalPadding } from "./utils";
import { ColumnFilterMenu } from "./utils/column-filter-menu";
import {
  ConversionMenu,
  type ConversionTargetsByColumnKey,
} from "./utils/conversion-menu";
import { customGridIcons } from "./utils/custom-grid-icons";
import type { ColumnFilter } from "./utils/filtering";
import { InteractableManager } from "./utils/interactable-manager";
import type { ColumnHeaderPath } from "./utils/interactable-manager/types";
import { overrideCustomRenderers } from "./utils/override-custom-renderers";
import type { ColumnSort } from "./utils/sorting";
import { defaultSortRows } from "./utils/sorting";
import { generateInteractableId, useDrawHeader } from "./utils/use-draw-header";
import { useRenderGridPortal } from "./utils/use-render-grid-portal";

export type { ConversionTargetsByColumnKey };

export type ColumnKey<C extends SizedGridColumn> = C["id"];

export type GridSort<S extends string> = ColumnSort<S>;

export type GridRow = { rowId: string };

export type SortGridRows<
  Row extends GridRow,
  Column extends SizedGridColumn,
  Sortable extends Column["id"],
> = (rows: Row[], sort: GridSort<Sortable>) => Row[];

export type GridProps<
  Row extends GridRow,
  Column extends SizedGridColumn,
  Sortable extends Column["id"],
> = Omit<
  DataEditorProps,
  | "onColumnResize"
  | "onColumnResizeEnd"
  | "onColumnResizeStart"
  | "columns"
  | "getCellContent"
  | "rows"
  | "onCellEdited"
> & {
  activeConversions?: {
    [columnBaseUrl: BaseUrl]: { dataTypeId: VersionedUrl; title: string };
  } | null;
  columnFilters?: ColumnFilter<ColumnKey<Column>, Row>[];
  columns: Column[];
  conversionTargetsByColumnKey?: ConversionTargetsByColumnKey;
  createGetCellContent: (rows: Row[]) => (cell: Item) => GridCell;
  createOnCellEdited?: (rows: Row[]) => DataEditorProps["onCellEdited"];
  currentlyDisplayedRowsRef?: MutableRefObject<Row[] | null>;
  dataLoading: boolean;
  enableCheckboxSelection?: boolean;
  externallyManagedFiltering?: boolean;
  firstColumnLeftPadding?: number;
  gridRef?: Ref<DataEditorRef>;
  /**
   * Provide to set an initial sort if sorting state is NOT managed by the parent component.
   */
  initialSort?: GridSort<Sortable>;
  onConversionTargetSelected?: ({
    columnKey,
    dataTypeId,
  }: {
    columnKey: BaseUrl;
    dataTypeId: VersionedUrl | null;
  }) => void;
  onSelectedRowsChange?: (selectedRows: Row[]) => void;
  resizable?: boolean;
  rows?: Row[];
  selectedRows?: Row[];
  sortableColumns?: Sortable[];
  /**
   * Provided if sorting state is managed by the parent component.
   */
  sort?: GridSort<Sortable>;
  /**
   * Provided if sorting state is managed by the parent component.
   */
  setSort?: (sort: GridSort<Sortable>) => void;
  /**
   * If sorts are not externally managed (i.e. sorts and setSorts are not provided), this function can be provided to
   * sort the rows. If it is not provided, a default sorting function will be used, which does a simple comparison
   * assuming column[sortKey] will return a value sortable as a number or string.
   */
  sortRows?: SortGridRows<Row, Column, Sortable>;
};

const emptyRect: ReturnType<VirtualElement["getBoundingClientRect"]> = {
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

const gridHeaderHeight = 42;

export const gridHeaderHeightWithBorder = gridHeaderHeight + 1;

export const gridHeaderBaseFont = "600 14px Inter";

export const gridHorizontalScrollbarHeight = 17;

export const Grid = <
  Row extends GridRow,
  Column extends SizedGridColumn,
  Sortable extends Column["id"],
>({
  activeConversions,
  createGetCellContent,
  createOnCellEdited,
  columnFilters,
  columns,
  conversionTargetsByColumnKey,
  currentlyDisplayedRowsRef,
  customRenderers,
  dataLoading,
  drawHeader,
  enableCheckboxSelection = false,
  externallyManagedFiltering,
  firstColumnLeftPadding,
  gridRef,
  initialSort,
  onConversionTargetSelected,
  onSelectedRowsChange,
  onVisibleRegionChanged,
  resizable = true,
  rows,
  selectedRows,
  sortableColumns,
  sort: externalSort,
  setSort: externalSetSort,
  sortRows,
  ...rest
}: GridProps<Row, Column, Sortable>) => {
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

  const [localSort, setLocalSort] = useState<GridSort<Sortable> | undefined>(
    () => {
      const firstSortableColumn = columns.find((column) =>
        sortableColumns?.includes(column.id as Sortable),
      );

      if (firstSortableColumn) {
        return {
          columnKey: firstSortableColumn.id as Sortable,
          direction: "asc",
        };
      }
    },
  );

  const sort = externalSort ?? localSort;
  const setSort = externalSetSort ?? setLocalSort;

  if (initialSort && externalSort) {
    throw new Error(
      "initialSort should not be provided when sort is externally managed",
    );
  }

  if (
    (externalSort && !externalSetSort) ||
    (!externalSort && externalSetSort)
  ) {
    throw new Error(
      "Either both or neither of sort and setSort should be provided",
    );
  }

  useEffect(() => {
    const firstSortableColumn = columns.find((column) =>
      sortableColumns?.includes(column.id as Sortable),
    );

    if (
      initialSort &&
      initialSort.columnKey !== localSort?.columnKey &&
      initialSort.direction !== localSort?.direction
    ) {
      setLocalSort(initialSort);
    } else if (firstSortableColumn && !localSort) {
      setLocalSort({
        columnKey: firstSortableColumn.id as Sortable,
        direction: "asc",
      });
    }
  }, [columns, initialSort, localSort, sortableColumns]);

  const [openFilterColumnKey, setOpenFilterColumnKey] = useState<string>();

  const [openConvertColumnKey, setOpenConvertColumnKey] = useState<string>();

  const handleSortClick = useCallback(
    (columnKey: Sortable) => {
      if (!sort) {
        throw new Error(
          `Sort button was clicked, but there is no active sort. Likely there are no sortable columns. This is an implementation error in the Grid component.`,
        );
      }

      if (sort.columnKey === columnKey) {
        setSort({
          columnKey,
          direction: sort.direction === "asc" ? "desc" : "asc",
        });
      } else {
        setSort({ columnKey, direction: "asc" });
      }
    },
    [sort, setSort],
  );

  const handleFilterClick = useCallback((columnKey: ColumnKey<Column>) => {
    setOpenFilterColumnKey(columnKey);
  }, []);

  const handleConvertClick = useCallback((columnKey: ColumnKey<Column>) => {
    setOpenConvertColumnKey(columnKey);
  }, []);

  const defaultDrawHeader = useDrawHeader({
    activeConversions,
    columns,
    conversionTargetsByColumnKey,
    filters: columnFilters,
    firstColumnLeftPadding,
    onConvertClicked: handleConvertClick,
    onFilterClick: handleFilterClick,
    onSortClick: handleSortClick,
    sort,
    sortableColumns: sortableColumns ?? [],
    tableId: tableIdRef.current,
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

  const filteredRows = useMemo<Row[] | undefined>(() => {
    if (externallyManagedFiltering) {
      return rows;
    }

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
  }, [externallyManagedFiltering, rows, columnFilters]);

  const sortedAndFilteredRows = useMemo<Row[] | undefined>(() => {
    if (externalSort) {
      return filteredRows;
    }

    if (filteredRows) {
      if (!localSort) {
        return filteredRows;
      }

      const sortRowFn = sortRows ?? defaultSortRows;

      return sortRowFn(filteredRows, localSort);
    }
  }, [externalSort, filteredRows, localSort, sortRows]);

  const gridSelection = useMemo(() => {
    if (sortedAndFilteredRows && selectedRows) {
      let mergedRowSelection = CompactSelection.empty();

      for (const selectedRow of selectedRows) {
        const selectedRowIndex = sortedAndFilteredRows.findIndex(
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
  }, [selection, sortedAndFilteredRows, selectedRows]);

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
      headerFontStyle: gridHeaderBaseFont,
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
    (column: LibraryGridColumn, newSize: number) => {
      setColumnSizes((prevColumnSizes) => {
        return {
          ...prevColumnSizes,
          [column.id]: newSize,
        };
      });
    },
    [],
  );

  const resizedColumns = useMemo<
    (SizedGridColumn & { width: number })[]
  >(() => {
    return columns.map((col) => {
      return { ...col, width: columnSizes[col.id] ?? col.width };
    });
  }, [columns, columnSizes]);

  const emptyStateText = dataLoading ? "Loading..." : "No results";

  const getSkeletonCellContent = useCallback(
    ([colIndex]: Item): TextCell => ({
      kind: GridCellKind.Text,
      displayData: colIndex === 0 ? emptyStateText : "",
      data: colIndex === 0 ? emptyStateText : "",
      allowOverlay: false,
      themeOverride: {
        cellHorizontalPadding: 15,
      },
      style: "faded",
    }),
    [emptyStateText],
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

  const filterIconVirtualElement = useMemo<PopperProps["anchorEl"]>(
    () => ({
      getBoundingClientRect: () => {
        if (!openFilterColumnKey) {
          return emptyRect;
        }

        const columnIndex = columns.findIndex(
          ({ id }) => id === openFilterColumnKey,
        );

        /**
         * We need to obtain the most recent version of the interactable,
         * as the user might have scrolled horizontally since the last
         * call to `getBoundingClientRect`.
         */
        const interactable = InteractableManager.getInteractable(
          `${tableIdRef.current}-${columnIndex}`,
          generateInteractableId("filter", openFilterColumnKey),
        );

        if (!interactable) {
          return emptyRect;
        }

        const { y: wrapperYPosition, x: wrapperXPosition } =
          wrapperRef.current!.getBoundingClientRect();

        const left =
          wrapperXPosition + interactable.posRelativeToVisibleGridArea.left;

        const top =
          interactable.posRelativeToVisibleGridArea.top + wrapperYPosition;

        return {
          width: 0,
          height: 0,
          ...interactable.posRelativeToVisibleGridArea,
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

  const conversionMenuVirtualElement = useMemo<PopperProps["anchorEl"]>(
    () => ({
      getBoundingClientRect: () => {
        if (!openConvertColumnKey) {
          return emptyRect;
        }

        const columnIndex = columns.findIndex(
          ({ id }) => id === openConvertColumnKey,
        );

        /**
         * We need to obtain the most recent version of the interactable,
         * as the user might have scrolled horizontally since the last
         * call to `getBoundingClientRect`.
         */
        const interactable = InteractableManager.getInteractable(
          `${tableIdRef.current}-${columnIndex}`,
          generateInteractableId("convert", openConvertColumnKey),
        );

        if (!interactable) {
          return emptyRect;
        }

        const { y: wrapperYPosition, x: wrapperXPosition } =
          wrapperRef.current!.getBoundingClientRect();

        const left =
          wrapperXPosition + interactable.posRelativeToVisibleGridArea.left;

        const top =
          interactable.posRelativeToVisibleGridArea.top + wrapperYPosition;

        return {
          width: 0,
          height: 0,
          ...interactable.posRelativeToVisibleGridArea,
          left,
          top,
          x: left,
          y: top,
          toJSON: () => "",
        };
      },
    }),
    [columns, openConvertColumnKey],
  );

  if (currentlyDisplayedRowsRef && sortedAndFilteredRows) {
    /**
     * This allows the parent component to be aware of the currently displayed rows
     * with filtering and sorting applied, after the render function has been called.
     * We may want to look into alternative ways of the parent becoming aware of the
     * column filter state in the future, but it's simplest to keep this encapsulated
     * in the `Grid` component for now.
     */
    // eslint-disable-next-line no-param-reassign
    currentlyDisplayedRowsRef.current = sortedAndFilteredRows;
  }

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
        anchorEl={filterIconVirtualElement}
        columnFilter={openFilterColumn}
        key={openFilterColumnKey}
        onClose={() => setOpenFilterColumnKey(undefined)}
        open={!!openFilterColumn}
        placement="bottom-start"
        popperRef={popperRef}
        transition
      />
      {conversionTargetsByColumnKey && onConversionTargetSelected && (
        <ConversionMenu
          activeConversion={
            activeConversions?.[openConvertColumnKey as BaseUrl] ?? null
          }
          anchorEl={conversionMenuVirtualElement}
          columnKey={openConvertColumnKey}
          conversionTargetsByColumnKey={conversionTargetsByColumnKey}
          key={openConvertColumnKey}
          onClose={() => setOpenConvertColumnKey(undefined)}
          open={!!openConvertColumnKey}
          onSelectConversionTarget={(dataTypeId) => {
            if (!openConvertColumnKey) {
              return;
            }

            onConversionTargetSelected({
              columnKey: openConvertColumnKey as BaseUrl,
              dataTypeId,
            });
            setOpenConvertColumnKey(undefined);
          }}
          placement="bottom-start"
          transition
        />
      )}

      <DataEditor
        cellActivationBehavior="single-click"
        columnSelect="none"
        columns={resizedColumns}
        customRenderers={overriddenCustomRenderers}
        drawFocusRing={false}
        drawHeader={drawHeader ?? defaultDrawHeader}
        getCellContent={
          sortedAndFilteredRows?.length
            ? createGetCellContent(sortedAndFilteredRows)
            : getSkeletonCellContent
        }
        getCellsForSelection
        getRowThemeOverride={getRowThemeOverride}
        gridSelection={gridSelection}
        headerHeight={gridHeaderHeight}
        headerIcons={customGridIcons}
        maxColumnWidth={1000}
        onCellEdited={
          sortedAndFilteredRows
            ? createOnCellEdited?.(sortedAndFilteredRows)
            : undefined
        }
        onColumnResize={resizable ? handleColumnResize : undefined}
        onGridSelectionChange={(newSelection) => {
          setSelection(newSelection);

          if (onSelectedRowsChange && sortedAndFilteredRows) {
            newSelection.rows.toArray();
            const updatedSelectedRows = sortedAndFilteredRows.filter(
              (_, rowIndex) => newSelection.rows.hasIndex(rowIndex),
            );

            onSelectedRowsChange(updatedSelectedRows);
          }
        }}
        onHeaderClicked={handleHeaderClicked}
        onItemHovered={({ location: [_colIndex, rowIndex], kind }) => {
          setHoveredRow(kind === "cell" ? rowIndex : undefined);
        }}
        onVisibleRegionChanged={handleVisibleRegionChanged}
        rangeSelect="cell"
        ref={gridRef}
        rowHeight={gridRowHeight}
        rows={sortedAndFilteredRows?.length ?? 1}
        smoothScrollX
        smoothScrollY
        theme={gridTheme}
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
            }
          : {})}
        {...rest}
        /**
         * icons defined via `headerIcons` are available to be drawn using
         * glide's `spriteManager.drawSprite`,
         * which will be used to draw svg icons inside custom cells
         */
        width="100%"
      />
    </Box>
  );
};
