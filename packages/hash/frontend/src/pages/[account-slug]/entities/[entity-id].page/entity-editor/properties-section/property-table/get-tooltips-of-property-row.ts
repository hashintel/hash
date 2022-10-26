import { CustomGridIcon } from "../../../../../../../components/GlideGlid/custom-grid-icons";
import { CellTooltipData } from "../../../../../../../components/GlideGlid/use-grid-tooltip/types";
import { PropertyRow } from "./types";

/** @todo return the list of tooltips for property properly */
export const getTooltipsOfPropertyRow = (
  data: PropertyRow,
): CellTooltipData[] => {
  if (!data.required) {
    return [];
  }

  return [
    {
      icon: CustomGridIcon.ASTERISK_CIRCLE,
      text: "This property is required",
    },
  ];
};
