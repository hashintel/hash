import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import { isPlainObject } from "lodash";
import { getYCenter } from "../../../../../../../../components/GlideGlid/utils";
import { drawNestedPropertySummary } from "./value-cell/draw-nested-property-summary";
import { ValueCell } from "./value-cell/types";
import { ValueCellEditor } from "./value-cell/value-cell-editor";

export const renderValueCell: CustomRenderer<ValueCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is ValueCell =>
    (cell.data as any).kind === "value-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    const { value } = cell.data.property;

    ctx.fillStyle = theme.textHeader;
    ctx.font = theme.baseFontStyle;

    if (isPlainObject(value)) {
      return drawNestedPropertySummary(args);
    }

    const yCenter = getYCenter(args);

    ctx.fillText(String(value), rect.x + theme.cellHorizontalPadding, yCenter);
  },
  provideEditor: (cell) => {
    const { value } = cell.data.property;

    /**
     * @todo instead of doing this, set `allowOverlay=false` in the cell data if type is object
     */
    if (isPlainObject(value)) {
      return;
    }

    return {
      styleOverride: { boxShadow: "none" },
      disablePadding: true,
      editor: ValueCellEditor,
    };
  },
};
