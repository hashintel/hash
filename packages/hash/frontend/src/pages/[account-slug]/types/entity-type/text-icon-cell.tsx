import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import type { CustomIcon } from "@glideapps/glide-data-grid/dist/ts/data-grid/data-grid-sprites";
import { getCellHorizontalPadding } from "../../../../components/GlideGlid/utils";
import { drawTextWithIcon } from "../../../../components/GlideGlid/utils/draw-text-with-icon";

export interface TextIconCellProps {
  readonly kind: "value-icon-cell";
  value: string;
  icon: CustomIcon;
}

export type TextIconCell = CustomCell<TextIconCellProps>;

export const renderTextIconCell: CustomRenderer<TextIconCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is TextIconCell =>
    (cell.data as any).kind === "value-icon-cell",
  draw: (args, cell) => {
    const { theme, rect, ctx } = args;
    const { value, icon } = cell.data;

    const columnPadding = getCellHorizontalPadding(true);
    const iconLeft = rect.x + columnPadding;

    // prepare to fill text
    ctx.font = theme.baseFontStyle;

    drawTextWithIcon({
      args,
      icon,
      text: value,
      left: iconLeft,
      iconSize: 12,
      gap: 8,
    });
  },
};
