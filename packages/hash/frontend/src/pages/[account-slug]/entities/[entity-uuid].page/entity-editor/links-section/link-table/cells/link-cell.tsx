import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
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
    const { linkRow } = cell.data;

    const yCenter = getYCenter(args);
    const iconLeft = rect.x + getCellHorizontalPadding(true);

    const iconSize = 16;
    spriteManager.drawSprite(
      "bpLink",
      "normal",
      ctx,
      iconLeft,
      yCenter - iconSize / 2,
      iconSize,
      theme,
    );

    const textLeft = iconLeft + iconSize + 5;
    ctx.fillStyle = theme.textHeader;
    ctx.fillText(linkRow.linkTitle, textLeft, yCenter);

    drawCellFadeOutGradient(args);
  },
};
