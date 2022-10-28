import {
  CustomCell,
  DrawCustomCellCallback,
  DrawHeaderCallback,
  GridCellKind,
  GridColumn,
} from "@glideapps/glide-data-grid";
import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";
import { useTheme } from "@mui/material";
import { useCallback } from "react";
import { CustomGridIcon } from "./custom-grid-icons";

type TableSortType = "asc" | "desc";

export interface TableSort<T extends string> {
  key: T;
  dir: TableSortType;
}

export type SetTableSort<T extends string> = (sort: TableSort<T>) => void;

export type TableExpandStatus = Record<string, boolean>;

export type SetTableExpandStatus = (status: TableExpandStatus) => void;

export const firstColumnPadding = 36;
export const columnPadding = 22;

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

export const useDrawHeader = <T extends string>(
  sort: TableSort<T>,
  columns: GridColumn[],
) => {
  const { palette } = useTheme();

  const drawHeader: DrawHeaderCallback = useCallback(
    (args) => {
      const { ctx, rect, column, columnIndex, theme } = args;
      const { x, y, height } = rect;

      const paddingLeft =
        columnIndex === 0 ? firstColumnPadding : columnPadding;

      // center of the rectangle, we'll use it to draw the text & sort indicator
      const centerY = y + height / 2 + 2;

      // draw text
      ctx.fillStyle = palette.gray[80];
      ctx.font = theme.headerFontStyle;
      ctx.fillText(column.title, x + paddingLeft, centerY);

      const columnKey = columns[columnIndex]?.id;
      const isSorted = columnKey === sort.key;

      // draw sort indicator
      if (isSorted) {
        const titleWidth = ctx.measureText(column.title).width;
        const indicatorX = x + paddingLeft + titleWidth + 6;
        const indicatorY = centerY;

        drawHeaderSortIndicator(indicatorX, indicatorY, sort.dir, ctx);
      }

      return true;
    },
    [palette, sort, columns],
  );

  return drawHeader;
};

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

export const createHandleHeaderClicked = <T extends string>(
  columns: GridColumn[],
  sort: TableSort<T>,
  setTableSort: SetTableSort<T>,
) => {
  return (col: number) => {
    const key = columns[col]?.id as T;

    if (!key) {
      return;
    }

    const isSorted = key === sort.key;

    setTableSort({
      key,
      dir: isSorted && sort.dir === "asc" ? "desc" : "asc",
    });
  };
};

export const sortRowData = <T extends string, RowData extends Record<T, any>[]>(
  rowData: RowData,
  sort: TableSort<T>,
) => {
  /**
   * cloning the array, we want to return a new array,
   * so React can run effects & update state properly
   */
  return [...rowData].sort((row1, row2) => {
    // we sort only by alphabetical order for now
    const key1 = String(row1[sort.key]);
    const key2 = String(row2[sort.key]);
    let comparison = key1.localeCompare(key2);

    if (sort.dir === "desc") {
      // reverse if descending
      comparison = -comparison;
    }

    return comparison;
  });
};

/**
 * @todo remove this function and use ctx.roundRect when firefox supports it
 * @see https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/roundRect#browser_compatibility
 */
export const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 5,
  fill = false,
  stroke = true,
) => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) {
    ctx.fill();
  }
  if (stroke) {
    ctx.stroke();
  }
};

export const getYCenter = (args: DrawArgs<CustomCell>) => {
  const { y, height } = args.rect;
  return y + height / 2 + 1;
};

export const drawChipWithIcon = (
  args: DrawArgs<CustomCell>,
  text: string,
  left: number,
  textColor?: string,
  bgColor?: string,
) => {
  const { ctx, theme } = args;
  const yCenter = getYCenter(args);

  const height = 26;
  const chipTop = yCenter - height / 2;
  const paddingX = 12;
  const iconSize = 10;
  const gap = 6;

  const iconLeft = left + paddingX;
  const textLeft = iconSize + gap + iconLeft;

  const textWidth = ctx.measureText(text).width;
  const chipWidth = iconSize + gap + textWidth + 2 * paddingX;

  ctx.fillStyle = bgColor ?? theme.bgBubble;
  ctx.beginPath();
  roundRect(ctx, left, chipTop, chipWidth, height, height / 2, true, false);
  ctx.fill();

  args.spriteManager.drawSprite(
    CustomGridIcon.ASTERISK,
    "normal",
    ctx,
    iconLeft,
    yCenter - iconSize / 2,
    iconSize,
    { ...theme, fgIconHeader: textColor ?? theme.textBubble },
  );

  ctx.fillStyle = textColor ?? theme.textBubble;
  ctx.fillText(text, textLeft, yCenter);

  return chipWidth;
};
