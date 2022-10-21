import { CustomCell } from "@glideapps/glide-data-grid";

export type GridTooltip = {
  col: number;
  row: number;
  text: string;
  iconX: number;
};

export interface TooltipCellProps {
  tooltips: string[];
  showTooltip: (tooltip: GridTooltip) => void;
  hideTooltip: (col: number, row: number) => void;
}

export type TooltipCell = CustomCell<TooltipCellProps>;
