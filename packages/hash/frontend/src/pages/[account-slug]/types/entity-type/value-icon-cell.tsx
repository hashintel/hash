import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import type { CustomIcon } from "@glideapps/glide-data-grid/dist/ts/data-grid/data-grid-sprites";
import {
  getCellHorizontalPadding,
  getYCenter,
} from "../../../../components/GlideGlid/utils";

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

    const yCenter = getYCenter(args);
    const iconGap = 8;
    const columnPadding = getCellHorizontalPadding(true);

    const iconLeft = rect.x + columnPadding;
    const iconSize = 12;

    args.spriteManager.drawSprite(
      icon,
      "normal",
      ctx,
      iconLeft,
      yCenter - iconSize / 2,
      iconSize,
      theme,
    );

    const textLeft = rect.x + columnPadding + iconSize + iconGap;

    // prepare to fill text
    ctx.fillStyle = theme.textHeader;
    ctx.font = theme.baseFontStyle;

    // fill text
    ctx.fillText(value, textLeft, yCenter);
  },
};
