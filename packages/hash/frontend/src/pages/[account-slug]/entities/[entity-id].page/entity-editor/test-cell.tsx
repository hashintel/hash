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
    const { ctx, rect } = args;

    const {
      data: { value },
    } = cell;

    const yCenter = rect.y + rect.height / 2;

    ctx.fillStyle = "black";
    ctx.fillText(value, rect.x + 20, yCenter);
    ctx.fillStyle = "#f005";
    ctx.strokeStyle = "#f005";
  },
};
