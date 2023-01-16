import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import { customColors } from "@local/design-system/src/theme/palette";

import {
  getCellHorizontalPadding,
  getYCenter,
} from "../../../../../../../../components/grid/utils";
import { drawCellFadeOutGradient } from "../../../../../../../../components/grid/utils/draw-cell-fade-out-gradient";
import { LinkRow } from "../types";

export interface LinkCellProps {
  readonly kind: "link-cell";
  linkRow: LinkRow;
}

export type LinkCell = CustomCell<LinkCellProps>;

export const renderLinkCell: CustomRenderer<LinkCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is LinkCell =>
    (cell.data as any).kind === "link-cell",
  draw: (args, cell) => {
    const { rect, ctx, theme, spriteManager } = args;
    const { linkTitle, maxItems } = cell.data.linkRow;

    ctx.fillStyle = theme.textHeader;
    ctx.font = theme.baseFontStyle;

    const yCenter = getYCenter(args);
    const iconLeft = rect.x + getCellHorizontalPadding(true);

    const iconSize = 16;
    spriteManager.drawSprite(
      maxItems > 1 ? "bpList" : "bpLink",
      "normal",
      ctx,
      iconLeft,
      yCenter - iconSize / 2,
      iconSize,
      maxItems > 1 ? theme : { ...theme, fgIconHeader: customColors.blue[70] },
    );

    const textLeft = iconLeft + iconSize + 5;
    ctx.fillStyle = theme.textHeader;
    ctx.fillText(linkTitle, textLeft, yCenter);

    drawCellFadeOutGradient(args);
  },
};
