import { CellTooltipData } from "../../../../../../../components/grid/utils/use-grid-tooltip/types";
import { PropertyRow } from "./types";

export const getTooltipsOfPropertyRow = (
  row: PropertyRow,
): CellTooltipData[] => {
  if (!row.required) {
    return [];
  }

  return [
    {
      icon: "bpAsteriskCircle",
      text: "This property is required",
    },
  ];
};
