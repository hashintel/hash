import { CellTooltipData } from "../../../../../../../components/grid/utils/use-grid-tooltip/types";
import { PropertyRow } from "./types";

export const getTooltipsOfPropertyRow = (
  data: PropertyRow,
): CellTooltipData[] => {
  if (!data.required) {
    return [];
  }

  return [
    {
      icon: "bpAsteriskCircle",
      text: "This property is required",
    },
  ];
};
