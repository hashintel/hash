import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import type { CustomIcon } from "@glideapps/glide-data-grid/dist/ts/data-grid/data-grid-sprites";
import { customColors } from "@hashintel/design-system";

import { getCellHorizontalPadding } from "../../../../../../components/grid/utils";
import { drawTextWithIcon } from "../../../../../../components/grid/utils/draw-text-with-icon";

export interface TextIconCellProps {
  readonly kind: "text-icon-cell";
  value: string;
  icon: CustomIcon;
  onClick?: () => void;
}

export type TextIconCell = CustomCell<TextIconCellProps>;

export const renderTextIconCell: CustomRenderer<TextIconCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is TextIconCell =>
    (cell.data as any).kind === "text-icon-cell",
  draw: (args, cell) => {
    const { theme, rect, ctx } = args;
    const { value, icon } = cell.data;

    const columnPadding = getCellHorizontalPadding(true);
    const iconLeft = rect.x + columnPadding;

    // prepare to fill text
    ctx.font = theme.baseFontStyle;

    const color = args.highlighted ? customColors.blue[70] : theme.textHeader;

    drawTextWithIcon({
      args,
      icon,
      text: value,
      left: iconLeft,
      iconSize: 12,
      gap: 8,
      textColor: color,
      iconColor: color,
    });
  },
  onClick: (args) => {
    args.cell.data.onClick?.();
    return undefined;
  },
};
