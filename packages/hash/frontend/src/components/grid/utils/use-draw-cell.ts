import {
  DrawCustomCellCallback,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import { useTheme } from "@mui/material";
import { useCallback } from "react";

import { getCellHorizontalPadding, getYCenter } from "../utils";

export const useDrawCell = () => {
  const { palette } = useTheme();

  const drawCell: DrawCustomCellCallback = useCallback(
    (args) => {
      const { cell, rect, ctx, col } = args;
      if (cell.kind !== GridCellKind.Text) {
        return false;
      }

      ctx.save();

      const paddingLeft = getCellHorizontalPadding(col === 0);
      ctx.fillStyle = palette.gray[80];
      ctx.fillText(cell.displayData, rect.x + paddingLeft, getYCenter(args));

      ctx.restore();

      return true;
    },
    [palette],
  );

  return drawCell;
};
