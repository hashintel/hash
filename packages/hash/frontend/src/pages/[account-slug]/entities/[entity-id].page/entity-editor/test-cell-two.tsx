import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import { TooltipCellProps } from "./use-grid-tooltip";

export interface TestCellTwoProps extends TooltipCellProps {
  readonly kind: "custom-cell";
}

export type TestCellTwo = CustomCell<TestCellTwoProps>;

export const renderTestCellTwo: CustomRenderer<TestCellTwo> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is TestCellTwo =>
    (cell.data as any).kind === "custom-cell",
  draw: (args) => {
    const { ctx, rect } = args;

    const yCenter = rect.y + rect.height / 2;

    ctx.fillStyle = "black";
    ctx.fillText("a custom cell", rect.x + 20, yCenter);
    ctx.fillStyle = "#f005";
    ctx.strokeStyle = "#f005";
  },
};
