import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system/slim";
import type {
  DrawHeaderCallback,
  SizedGridColumn,
} from "@glideapps/glide-data-grid";
import { useTheme } from "@mui/material";
import { useCallback } from "react";

import type { ColumnKey, ConversionTargetsByColumnKey } from "../grid";
import { getCellHorizontalPadding, getYCenter } from "../utils";
import type { ColumnFilter } from "./filtering";
import { InteractableManager } from "./interactable-manager";
import type {
  Interactable,
  InteractablePosition,
} from "./interactable-manager/types";
import type { ColumnSort } from "./sorting";

export const generateInteractableId = (
  type: "filter" | "sort" | "convert",
  columnKey: string,
) => `column-${type}-${columnKey}`;

export const useDrawHeader = <
  C extends SizedGridColumn,
  S extends C["id"],
>(props: {
  activeConversions?: {
    [columnBaseUrl: BaseUrl]: { dataTypeId: VersionedUrl; title: string };
  } | null;
  columns: C[];
  conversionTargetsByColumnKey?: ConversionTargetsByColumnKey;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filters?: ColumnFilter<ColumnKey<C>, any>[];
  firstColumnLeftPadding?: number;
  onConvertClicked?: (
    columnKey: ColumnKey<C>,
    interactablePosition: InteractablePosition,
  ) => void;
  onFilterClick?: (
    columnKey: ColumnKey<C>,
    interactablePosition: InteractablePosition,
  ) => void;
  onSortClick?: (columnKey: S) => void;
  sort?: ColumnSort<S>;
  sortableColumns: S[];
  tableId: string;
}): DrawHeaderCallback => {
  const {
    activeConversions,
    columns,
    conversionTargetsByColumnKey,
    filters,
    firstColumnLeftPadding,
    onConvertClicked,
    onFilterClick,
    onSortClick,
    sort,
    sortableColumns,
    tableId,
  } = props;

  const muiTheme = useTheme();

  const drawHeader: DrawHeaderCallback = useCallback(
    (args) => {
      const { ctx, rect, column, columnIndex, theme } = args;
      const { x: columnHeaderStartX, width: columnHeaderWidth } = rect;

      const paddingLeft =
        typeof firstColumnLeftPadding !== "undefined" && columnIndex === 0
          ? firstColumnLeftPadding
          : getCellHorizontalPadding();

      const paddingRight = getCellHorizontalPadding();

      // center of the rectangle, we'll use it to draw the text & sort indicator
      const centerY = getYCenter(args);

      // draw text
      ctx.fillStyle = theme.textHeader;
      ctx.font = theme.headerFontStyle;
      ctx.fillText(column.title, columnHeaderStartX + paddingLeft, centerY);

      const columnKey = columns[columnIndex]?.id as ColumnKey<C>;

      if (columnIndex < 0) {
        return true;
      }

      const interactables: Interactable[] = [];

      const sortIconSize = 15;

      const iconSpacing = 10;

      const isSortable = sort && sortableColumns.includes(column.id as S);

      if (isSortable) {
        const sortIconStartX =
          columnHeaderStartX +
          (columnHeaderWidth - sortIconSize - paddingRight);

        const isSortActive = sort.columnKey === columnKey;

        args.spriteManager.drawSprite(
          /**
           * @todo: support other kinds of sort icons
           */
          `arrow${sort.direction === "asc" ? "Down" : "Up"}AzLight`,
          "normal",
          ctx,
          sortIconStartX,
          centerY - sortIconSize / 2,
          sortIconSize,
          {
            ...theme,
            fgIconHeader: isSortActive
              ? muiTheme.palette.blue[70]
              : muiTheme.palette.gray[50],
          },
          1,
        );

        interactables.push(
          InteractableManager.createColumnHeaderInteractable(
            { ...args, tableId },
            {
              id: generateInteractableId("sort", columnKey),
              pos: {
                left: sortIconStartX,
                right: sortIconStartX + sortIconSize,
                top: centerY - sortIconSize / 2,
                bottom: centerY + sortIconSize / 2,
              },
              onClick: () => onSortClick?.(columnKey as S),
            },
          ),
        );
      }

      const columnFilter = filters?.find(
        (filter) => filter.columnKey === columnKey,
      );

      const filterIconSize = 15;

      if (columnFilter) {
        const columnFilterX =
          columnHeaderStartX +
          (columnHeaderWidth -
            paddingRight -
            (isSortable ? sortIconSize + iconSpacing : 0) -
            filterIconSize);

        const isFilterModified =
          columnFilter.selectedFilterItemIds.size !==
          columnFilter.filterItems.length;

        args.spriteManager.drawSprite(
          "filterLight",
          "normal",
          ctx,
          columnFilterX,
          centerY - filterIconSize / 2,
          filterIconSize,
          {
            ...theme,
            fgIconHeader: isFilterModified
              ? muiTheme.palette.blue[70]
              : muiTheme.palette.gray[50],
          },
          1,
        );

        interactables.push(
          InteractableManager.createColumnHeaderInteractable(
            { ...args, tableId },
            {
              id: generateInteractableId("filter", columnKey),
              pos: {
                left: columnFilterX,
                right: columnFilterX + filterIconSize,
                top: centerY - filterIconSize / 2,
                bottom: centerY + filterIconSize / 2,
              },
              onClick: (interactable) =>
                onFilterClick?.(columnKey, interactable.pos),
            },
          ),
        );
      }

      const hasConversionApplied = activeConversions?.[columnKey as BaseUrl];

      if (
        hasConversionApplied ||
        Object.keys(conversionTargetsByColumnKey?.[columnKey] ?? {}).length > 0
      ) {
        const calculatorIconSize = 15;

        const calculatorIconStartX =
          columnHeaderStartX +
          (columnHeaderWidth -
            paddingRight -
            (isSortable ? sortIconSize + iconSpacing : 0) -
            (columnFilter ? filterIconSize + iconSpacing : 0) -
            calculatorIconSize);

        args.spriteManager.drawSprite(
          "equalsRegular",
          "normal",
          ctx,
          calculatorIconStartX,
          centerY - calculatorIconSize / 2,
          calculatorIconSize,
          {
            ...theme,
            fgIconHeader: hasConversionApplied
              ? muiTheme.palette.blue[70]
              : muiTheme.palette.gray[50],
          },
          1,
        );

        interactables.push(
          InteractableManager.createColumnHeaderInteractable(
            { ...args, tableId },
            {
              id: generateInteractableId("convert", columnKey),
              pos: {
                left: calculatorIconStartX,
                right: calculatorIconStartX + calculatorIconSize,
                top: centerY - calculatorIconSize / 2,
                bottom: centerY + calculatorIconSize / 2,
              },
              onClick: (interactable) =>
                onConvertClicked?.(columnKey, interactable.pos),
            },
          ),
        );
      }

      if (interactables.length > 0) {
        InteractableManager.setInteractablesForColumnHeader(
          { ...args, tableId },
          interactables,
        );
      }

      return true;
    },
    [
      activeConversions,
      columns,
      conversionTargetsByColumnKey,
      filters,
      firstColumnLeftPadding,
      muiTheme.palette.blue,
      muiTheme.palette.gray,
      onConvertClicked,
      onFilterClick,
      onSortClick,
      sort,
      sortableColumns,
      tableId,
    ],
  );

  return drawHeader;
};
