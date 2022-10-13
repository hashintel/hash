import {
  DrawCustomCellCallback,
  DrawHeaderCallback,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import { useTheme } from "@mui/material";
import { useCallback } from "react";
import { useEntityEditor } from "../entity-editor-context";
import { columnPadding, firstColumnPadding, gridColumns } from "./constants";
import { TableSortType } from "./types";

export const useDrawCell = () => {
  const { palette } = useTheme();

  const drawCell: DrawCustomCellCallback = useCallback(
    (args) => {
      const { cell, rect, ctx, col } = args;
      if (cell.kind !== GridCellKind.Text) {
        return false;
      }

      ctx.save();
      const { x, y, height } = rect;

      const paddingLeft = col === 0 ? firstColumnPadding : columnPadding;
      ctx.fillStyle = palette.gray[80];
      ctx.fillText(cell.displayData, x + paddingLeft, y + height / 2 + 2);
      ctx.restore();

      return true;
    },
    [palette],
  );

  return drawCell;
};

const drawHeaderSortIndicator = (
  x: number,
  y: number,
  dir: TableSortType,
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

export const useDrawHeader = () => {
  const { propertySort } = useEntityEditor();
  const { palette } = useTheme();

  const drawHeader: DrawHeaderCallback = useCallback(
    (args) => {
      const { ctx, rect, column, columnIndex } = args;
      const { x, y, height } = rect;

      const paddingLeft =
        columnIndex === 0 ? firstColumnPadding : columnPadding;

      // center of the rectangle, we'll use it to draw the text & sort indicator
      const centerY = y + height / 2 + 2;

      // draw text
      ctx.fillStyle = palette.gray[80];
      ctx.fillText(column.title, x + paddingLeft, centerY);

      const columnKey = gridColumns[columnIndex]?.id;
      const isSorted = columnKey === propertySort.key;

      // draw sort indicator
      if (isSorted) {
        const titleWidth = column.title.length * 7.5;
        const indicatorX = x + paddingLeft + titleWidth + 6;
        const indicatorY = centerY;

        drawHeaderSortIndicator(indicatorX, indicatorY, propertySort.dir, ctx);
      }

      return true;
    },
    [palette, propertySort],
  );

  return drawHeader;
};
