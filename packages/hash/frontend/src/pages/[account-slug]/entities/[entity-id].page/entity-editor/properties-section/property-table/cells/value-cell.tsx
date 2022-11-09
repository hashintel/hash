import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import {
  getCellHorizontalPadding,
  getYCenter,
} from "../../../../../../../../components/GlideGlid/utils";
import { isValueEmpty } from "../../get-property-count-summary";
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

    const yCenter = getYCenter(args);
    const left = rect.x + getCellHorizontalPadding();

    if (isValueEmpty(value)) {
      ctx.fillStyle = "#91A5BA";
      ctx.font = "italic 14px Inter";
      return ctx.fillText("No value", left, yCenter);
    }

    ctx.fillText(String(value), left, yCenter);
  },
  provideEditor: () => {
    return {
      styleOverride: { boxShadow: "none" },
      disablePadding: true,
      editor: ValueCellEditor,
    };
  },
};
