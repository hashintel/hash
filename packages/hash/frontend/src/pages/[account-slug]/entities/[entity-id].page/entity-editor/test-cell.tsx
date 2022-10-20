import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import { TooltipCellProps } from "./use-grid-tooltip";

export interface TestCellProps extends TooltipCellProps {
  readonly kind: "test-cell";
  value: string;
}

export type TestCell = CustomCell<TestCellProps>;

export const renderTestCell: CustomRenderer<TestCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is TestCell =>
    (cell.data as any).kind === "test-cell",
  draw: (args, cell) => {
    const { ctx, rect, hoverX = -100, col, row } = args;

    const {
      data: { value, tooltips, showTooltip: updateTooltip, hideTooltip },
    } = cell;

    const yCenter = rect.y + rect.height / 2;

    ctx.fillStyle = "black";
    ctx.fillText(value, rect.x + 20, yCenter);
    ctx.fillStyle = "#f005";
    ctx.strokeStyle = "#f005";

    const tooltipSize = 20;
    const tooltipPadding = 10;

    let tooltipCount = 0;

    for (let i = 0; i < tooltips.length; i++) {
      const tooltip = tooltips[i] ?? "";
      const tooltipX =
        rect.x + rect.width - tooltipSize - i * (tooltipPadding + tooltipSize);

      ctx.strokeRect(
        tooltipX,
        yCenter - tooltipSize / 2,
        tooltipSize,
        tooltipSize,
      );

      const actualTooltipX = tooltipX - rect.x;

      if (hoverX > actualTooltipX && hoverX < actualTooltipX + tooltipSize) {
        ctx.fillRect(
          tooltipX,
          yCenter - tooltipSize / 2,
          tooltipSize,
          tooltipSize,
        );

        tooltipCount++;

        updateTooltip({
          text: tooltip,
          iconX: actualTooltipX + tooltipSize / 2,
          col,
          row,
        });
      }
    }

    if (tooltipCount === 0) {
      hideTooltip(col, row);
    }

    return true;
  },
  provideEditor: () => undefined,
};
