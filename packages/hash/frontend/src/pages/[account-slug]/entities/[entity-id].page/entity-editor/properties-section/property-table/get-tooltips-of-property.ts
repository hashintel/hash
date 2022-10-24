import { CustomGridIcon } from "../../../../../../../components/GlideGlid/custom-grid-icons";
import { GridTooltipObj } from "../../../../../../../components/GlideGlid/use-grid-tooltip/types";
import { EnrichedPropertyType } from "./types";

/** @todo return the list of tooltips for property properly */
export const getTooltipsOfProperty = (
  data: EnrichedPropertyType,
): GridTooltipObj[] => {
  return [
    {
      icon: CustomGridIcon.LABEL,
      text: data.title,
    },
  ];
};
