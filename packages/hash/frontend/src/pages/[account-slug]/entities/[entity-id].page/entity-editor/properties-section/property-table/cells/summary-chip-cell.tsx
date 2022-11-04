import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import { getYCenter } from "../../../../../../../../components/GlideGlid/utils";
import { drawCellFadeOutGradient } from "../../../../../../../../components/GlideGlid/utils/draw-cell-fade-out-gradient";
import { drawRoundRect } from "../../../../../../../../components/GlideGlid/utils/draw-round-rect";

export interface SummaryChipCellProps {
  readonly kind: "summary-chip-cell";
  primaryText?: string;
  secondaryText?: string;
}

export type SummaryChipCell = CustomCell<SummaryChipCellProps>;

export const renderSummaryChipCell: CustomRenderer<SummaryChipCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is SummaryChipCell =>
    (cell.data as any).kind === "summary-chip-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    ctx.font = theme.baseFontStyle;

    const yCenter = getYCenter(args);
    const { primaryText = "" } = cell.data;

    let secondaryText = cell.data.secondaryText ?? "";

    if (primaryText && secondaryText) {
      secondaryText = ` ${secondaryText}`;
    }

    const left = rect.x + 20;
    const height = 26;
    const chipTop = yCenter - height / 2;
    const paddingX = 12;

    const primaryTextLeft = left + paddingX;
    const primaryTextWidth = ctx.measureText(primaryText).width;

    const secondaryTextLeft = primaryTextLeft + primaryTextWidth;
    const secondaryTextWidth = ctx.measureText(secondaryText).width;

    const chipWidth = primaryTextWidth + secondaryTextWidth + 2 * paddingX;

    ctx.strokeStyle = "#C1CFDE";
    ctx.beginPath();
    drawRoundRect(ctx, left, chipTop, chipWidth, height, height / 2);
    ctx.stroke();

    ctx.fillStyle = "#37434F";
    ctx.fillText(primaryText, primaryTextLeft, yCenter);

    ctx.fillStyle = "#758AA1";
    ctx.fillText(secondaryText, secondaryTextLeft, yCenter);

    drawCellFadeOutGradient(args);
  },
};
