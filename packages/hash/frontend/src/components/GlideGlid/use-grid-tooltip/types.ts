import { CustomCell, CustomRenderer } from "@glideapps/glide-data-grid";
import { ReactElement } from "react";
import { CustomGridIcon } from "../custom-grid-icons";

export type GridTooltip = {
  col: number;
  row: number;
  text: string;
  iconX: number;
};

/** @todo find a better name for this type */
export type GridTooltipObj = {
  text: string;
  icon: CustomGridIcon;
};

export interface TooltipCellProps {
  tooltips: GridTooltipObj[];
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
