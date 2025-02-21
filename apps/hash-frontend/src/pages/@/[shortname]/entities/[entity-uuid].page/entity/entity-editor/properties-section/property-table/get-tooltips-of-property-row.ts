import { customColors } from "@hashintel/design-system/theme";

import type { CellTooltipData } from "../../../../../../../../../components/grid/utils/use-grid-tooltip/types";
import type { PropertyRow } from "./types";

export const getTooltipsOfPropertyRow = (
  row: PropertyRow,
): CellTooltipData[] => {
  const { required, validationError } = row;

  if (validationError && validationError.type !== "missing") {
    return [
      {
        color: customColors.red[70],
        icon: "bpError",
        text: validationError.message,
      },
    ];
  }

  if (required) {
    return [
      {
        color:
          validationError?.type === "missing"
            ? customColors.red[70]
            : customColors.black,
        icon: "bpAsteriskCircle",
        text: "This property is required",
      },
    ];
  }

  return [];
};
