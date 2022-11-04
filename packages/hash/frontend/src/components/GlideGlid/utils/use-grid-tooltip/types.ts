import { CustomCell, CustomRenderer } from "@glideapps/glide-data-grid";
import type { CustomIcon } from "@glideapps/glide-data-grid/dist/ts/data-grid/data-grid-sprites";
import { ReactElement } from "react";

export type GridTooltip = {
  col: number;
  row: number;
  text: string;
  iconX: number;
};

export type CellTooltipData = {
  text: string;
  icon: CustomIcon;
};

export interface TooltipCellProps {
  tooltips: CellTooltipData[];
  showTooltip: (tooltip: GridTooltip) => void;
  hideTooltip: (col: number, row: number) => void;
}

export type TooltipCell = CustomCell<TooltipCellProps>;

export interface UseGridTooltipResponse {
  withTooltips: <T extends TooltipCell>(
    customRenderer: CustomRenderer<T>,
  ) => CustomRenderer<T>;
  tooltipElement: ReactElement;
  showTooltip: (tooltip: GridTooltip) => void;
  hideTooltip: (col: number, row: number) => void;
}
