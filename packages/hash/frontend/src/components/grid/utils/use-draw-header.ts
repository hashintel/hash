import { DrawHeaderCallback, GridColumn } from "@glideapps/glide-data-grid";
import { useCallback } from "react";

import { getCellHorizontalPadding, getYCenter } from "../utils";
import { ColumnSort, ColumnSortType } from "./sorting";

const drawHeaderSortIndicator = (
  x: number,
  y: number,
  dir: ColumnSortType,
  ctx: CanvasRenderingContext2D,
) => {
  const width = 6;
  const height = width * 0.6;

  let adjust = height / 2;
  if (dir === "asc") {
    adjust = -adjust;
  }

  // adjustedY makes toggling asc-desc look like flipping the indicator
  const adjustedY = y + adjust;

  ctx.beginPath();
  ctx.moveTo(x, adjustedY);
  ctx.lineTo(x + width / 2, adjustedY + (dir === "asc" ? height : -height));
  ctx.lineTo(x + width, adjustedY);
  ctx.fill();
};

export const useDrawHeader = <T extends string>(
  sort: ColumnSort<T> | undefined,
  columns: GridColumn[],
) => {
  const drawHeader: DrawHeaderCallback = useCallback(
    (args) => {
      const { ctx, rect, column, columnIndex, theme } = args;
      const { x } = rect;

      const paddingLeft = getCellHorizontalPadding(columnIndex === 0);

      // center of the rectangle, we'll use it to draw the text & sort indicator
      const centerY = getYCenter(args);

      // draw text
      ctx.fillStyle = theme.textHeader;
      ctx.font = theme.headerFontStyle;
      ctx.fillText(column.title, x + paddingLeft, centerY);

      const columnKey = columns[columnIndex]?.id;

      if (sort) {
        const isSorted = columnKey === sort.key;

        // draw sort indicator
        if (isSorted) {
          const titleWidth = ctx.measureText(column.title).width;
          const indicatorX = x + paddingLeft + titleWidth + 6;
          const indicatorY = centerY;

          drawHeaderSortIndicator(indicatorX, indicatorY, sort.dir, ctx);
        }
      }

      return true;
    },
    [sort, columns],
  );

  return drawHeader;
};
