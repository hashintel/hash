import {
  DrawCustomCellCallback,
  DrawHeaderCallback,
  GridCellKind,
  GridColumn,
} from "@glideapps/glide-data-grid";
import { useTheme } from "@mui/material";
import { useCallback } from "react";

type TableSortType = "asc" | "desc";
type TableRow = Record<string, any>;

export interface TableSort<T extends TableRow> {
  key: keyof T;
  dir: TableSortType;
}

export type SetTableSort<T extends TableRow> = (sort: TableSort<T>) => void;

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

export const useDrawHeader = <T extends TableRow>(
  sort: TableSort<T>,
  columns: GridColumn[],
) => {
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

      const columnKey = columns[columnIndex]?.id;
      const isSorted = columnKey === sort.key;

      // draw sort indicator
      if (isSorted) {
        const titleWidth = column.title.length * 7.5;
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

export const createHandleHeaderClicked = <T extends TableRow>(
  columns: GridColumn[],
  sort: TableSort<T>,
  setTableSort: SetTableSort<T>,
) => {
  return (col: number) => {
    const key = columns[col]?.id as keyof T;

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

export const sortRowData = <T extends TableRow>(
  rowData: T[],
  sort: TableSort<T>,
) => {
  return rowData.sort((row1, row2) => {
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
