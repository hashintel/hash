import type {
  DrawHeaderCallback,
  SizedGridColumn,
} from "@glideapps/glide-data-grid";
import { useTheme } from "@mui/material";
import { useCallback } from "react";

import type { ColumnKey } from "../grid";
import { getCellHorizontalPadding, getYCenter } from "../utils";
import type { ColumnFilter } from "./filtering";
import { InteractableManager } from "./interactable-manager";
import type {
  Interactable,
  InteractablePosition,
} from "./interactable-manager/types";
import type { ColumnSort } from "./sorting";

export const useDrawHeader = <
  C extends SizedGridColumn,
  S extends C["id"],
>(props: {
  columns: C[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filters?: ColumnFilter<ColumnKey<C>, any>[];
  firstColumnLeftPadding?: number;
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
    columns,
    filters,
    firstColumnLeftPadding,
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

      if (sort && sortableColumns.includes(column.id as S)) {
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
              id: `column-sort-${columnKey}`,
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

      if (columnFilter) {
        const filterIconSize = 15;

        const columnFilterX =
          columnHeaderStartX +
          (columnHeaderWidth -
            paddingRight -
            (sort ? sortIconSize + iconSpacing : 0) -
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
      columns,
      filters,
      firstColumnLeftPadding,
      muiTheme.palette.blue,
      muiTheme.palette.gray,
      onFilterClick,
      onSortClick,
      sort,
      sortableColumns,
      tableId,
    ],
  );

  return drawHeader;
};
