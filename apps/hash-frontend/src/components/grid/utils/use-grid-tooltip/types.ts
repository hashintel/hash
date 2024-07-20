import type { ReactElement } from "react";
import type { CustomCell } from "@glideapps/glide-data-grid";

import type { CustomIcon } from "../custom-grid-icons";

export interface GridTooltip {
  colIndex: number;
  rowIndex: number;
  text: string;
  iconX: number;
}

export interface CellTooltipData {
  text: string;
  icon: CustomIcon;
}

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
