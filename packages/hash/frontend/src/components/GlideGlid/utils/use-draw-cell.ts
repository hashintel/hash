import {
  DrawCustomCellCallback,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import { useTheme } from "@mui/material";
import { useCallback } from "react";
import { getCellHorizontalPadding } from "../utils";

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

      const paddingLeft = getCellHorizontalPadding(col === 0);
      ctx.fillStyle = palette.gray[80];
      ctx.fillText(cell.displayData, x + paddingLeft, y + height / 2 + 2);
      ctx.restore();

      return true;
    },
    [palette],
  );

  return drawCell;
};
