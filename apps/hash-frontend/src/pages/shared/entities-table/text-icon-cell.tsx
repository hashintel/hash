import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import type { CustomIcon } from "@glideapps/glide-data-grid/dist/ts/data-grid/data-grid-sprites";
import { customColors } from "@hashintel/design-system/theme";

import { getCellHorizontalPadding } from "../../../components/grid/utils";
import { drawTextWithIcon } from "../../../components/grid/utils/draw-text-with-icon";

export interface TextIconCellProps {
  readonly kind: "text-icon-cell";
  value: string;
  icon: CustomIcon;
  onClick?: () => void;
}

export type TextIconCell = CustomCell<TextIconCellProps>;

export const createRenderTextIconCell = (params?: {
  firstColumnLeftPadding?: number;
}): CustomRenderer<TextIconCell> => ({
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is TextIconCell =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cell.data as any).kind === "text-icon-cell",
  draw: (args, cell) => {
    const { firstColumnLeftPadding } = params ?? {};
    const { theme, rect, ctx } = args;
    const { value, icon } = cell.data;

    const columnPadding =
      typeof firstColumnLeftPadding !== "undefined" && args.col === 1
        ? firstColumnLeftPadding
        : getCellHorizontalPadding();

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
});
