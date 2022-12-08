import { CustomCell } from "@glideapps/glide-data-grid";
import type { CustomIcon } from "@glideapps/glide-data-grid/dist/ts/data-grid/data-grid-sprites";
import { ReactElement } from "react";

export type GridTooltip = {
  colIndex: number;
  rowIndex: number;
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
  hideTooltip: (colIndex: number, rowIndex: number) => void;
}

export type TooltipCell = CustomCell<TooltipCellProps>;

export interface UseGridTooltipResponse {
  tooltipElement: ReactElement;
  showTooltip: (tooltip: GridTooltip) => void;
  hideTooltip: (colIndex: number, rowIndex: number) => void;
}
