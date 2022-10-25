import { CustomGridIcon } from "../../../../../../../components/GlideGlid/custom-grid-icons";
import { CellTooltipData } from "../../../../../../../components/GlideGlid/use-grid-tooltip/types";
import { EnrichedPropertyType } from "./types";

/** @todo return the list of tooltips for property properly */
export const getTooltipsOfProperty = (
  data: EnrichedPropertyType,
): CellTooltipData[] => {
  if (!data.required) {
    return [];
  }

  return [
    {
      icon: CustomGridIcon.ASTERIKS_CIRCLE,
      text: "This property is required",
    },
  ];
};
