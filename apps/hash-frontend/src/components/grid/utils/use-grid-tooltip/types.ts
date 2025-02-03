import type { CustomCell } from "@glideapps/glide-data-grid";
import type { ReactElement } from "react";

import type { CustomIcon } from "../custom-grid-icons";

export type GridTooltip = {
  colIndex: number;
  rowIndex: number;
  content: string | ReactElement;
  horizontalAlign: "left" | "center";
  interactablePosRelativeToCell:
    | {
        right: number;
        top: number;
      }
    | {
        left: number;
        top: number;
      };
  interactableSize: {
    width: number;
    height: number;
  };
};

export type CellTooltipData = {
  color?: string;
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
  tooltipElement: ReactElement | null;
  showTooltip: (tooltip: GridTooltip) => void;
  hideTooltip: (colIndex: number, rowIndex: number) => void;
}
