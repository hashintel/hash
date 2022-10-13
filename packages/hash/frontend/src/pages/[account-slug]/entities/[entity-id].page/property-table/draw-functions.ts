import {
  DrawCustomCellCallback,
  DrawHeaderCallback,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import { useTheme } from "@mui/material";
import { useCallback } from "react";
import { columnPadding, firstColumnPadding } from "./constants";

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

export const useDrawHeader = () => {
  const { palette } = useTheme();

  const drawHeader: DrawHeaderCallback = useCallback(
    (args) => {
      const { ctx, rect, column, columnIndex } = args;
      const { x, y, height } = rect;

      const paddingLeft =
        columnIndex === 0 ? firstColumnPadding : columnPadding;

      ctx.fillStyle = palette.gray[80];
      ctx.fillText(column.title, x + paddingLeft, y + height / 2 + 2);

      return true;
    },
    [palette],
  );

  return drawHeader;
};
