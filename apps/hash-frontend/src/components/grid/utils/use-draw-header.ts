import { DrawHeaderCallback, GridColumn } from "@glideapps/glide-data-grid";
import { useTheme } from "@mui/material";
import { useCallback } from "react";

import { getCellHorizontalPadding, getYCenter } from "../utils";
import { ColumnFilter } from "./filtering";
import { InteractableManager } from "./interactable-manager";
import {
  Interactable,
  InteractablePosition,
} from "./interactable-manager/types";
import { ColumnSort } from "./sorting";

export const useDrawHeader = <T extends string>(props: {
  tableId: string;
  sorts?: ColumnSort<T>[];
  onSortClick?: (columnKey: T) => void;
  activeSortColumnKey?: T;
  filters?: ColumnFilter<T>[];
  onFilterClick?: (
    columnKey: T,
    interactablePosition: InteractablePosition,
  ) => void;
  columns: GridColumn[];
  firstColumnLeftPadding?: number;
}): DrawHeaderCallback => {
  const {
    activeSortColumnKey,
    tableId,
    sorts,
    filters,
    columns,
    firstColumnLeftPadding,
    onFilterClick,
    onSortClick,
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

      const columnKey = columns[columnIndex]?.id as T;

      if (columnIndex < 0) {
        return true;
      }

      const interactables: Interactable[] = [];

      const sortIconSize = 15;

      const iconSpacing = 10;

      const sort = sorts?.find(
        ({ columnKey: sortColumnKey }) => sortColumnKey === columnKey,
      );

      if (sort) {
        const sortIconStartX =
          columnHeaderStartX +
          (columnHeaderWidth - sortIconSize - paddingRight);

        const isSortActive = sort.columnKey === activeSortColumnKey;

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
              id: `column-sort-${columnKey}`,
              pos: {
                left: sortIconStartX,
                right: sortIconStartX + sortIconSize,
                top: centerY - sortIconSize / 2,
                bottom: centerY + sortIconSize / 2,
              },
              onClick: () => onSortClick?.(columnKey),
            },
          ),
        );
      }

      const columnFilter = filters?.find(
        (filter) => filter.columnKey === columnKey,
      );

      if (columnFilter) {
        const filterIconSize = 15;

        const columnFilterX =
          columnHeaderStartX +
          (columnHeaderWidth -
            paddingRight -
            (sort ? sortIconSize + iconSpacing : 0) -
            filterIconSize);

        const isFilterModified =
          columnFilter.selectedFilterItemIds.length !==
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
              id: `column-filter-${columnKey}`,
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

      if (interactables.length > 0) {
        InteractableManager.setInteractablesForColumnHeader(
          { ...args, tableId },
          interactables,
        );
      }

      return true;
    },
    [
      muiTheme,
      sorts,
      filters,
      columns,
      activeSortColumnKey,
      tableId,
      firstColumnLeftPadding,
      onSortClick,
      onFilterClick,
    ],
  );

  return drawHeader;
};
