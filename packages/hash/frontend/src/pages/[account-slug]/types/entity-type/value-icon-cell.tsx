import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import type { CustomIcon } from "@glideapps/glide-data-grid/dist/ts/data-grid/data-grid-sprites";
import { getCellHorizontalPadding } from "../../../../components/GlideGlid/utils";
import { drawTextWithIcon } from "../../../../components/GlideGlid/utils/draw-text-with-icon";

export interface ValueIconCellProps {
  readonly kind: "value-icon-cell";
  value: string;
  icon: CustomIcon;
}

export type ValueIconCell = CustomCell<ValueIconCellProps>;

export const renderValueIconCell: CustomRenderer<ValueIconCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is ValueIconCell =>
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
