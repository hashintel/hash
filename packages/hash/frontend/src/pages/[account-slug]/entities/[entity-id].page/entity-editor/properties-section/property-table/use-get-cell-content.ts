import { GridCell, GridCellKind, Item } from "@glideapps/glide-data-grid";
import { useCallback } from "react";
import { UseGridTooltipResponse } from "../../../../../../../components/GlideGlid/use-grid-tooltip/types";
import { ValueCellProps } from "./cells/value-cell";
import { propertyGridIndexes } from "./constants";
import { getTooltipsOfProperty } from "./get-tooltips-of-property";
import { PropertyRow } from "./types";

export const useGetCellContent = (
  rowData: PropertyRow[],
  showTooltip: UseGridTooltipResponse["showTooltip"],
  hideTooltip: UseGridTooltipResponse["hideTooltip"],
) => {
  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const property = rowData[row];

      if (!property) {
        throw new Error("property not found");
      }

      const columnKey = propertyGridIndexes[col];

      if (!columnKey) {
        throw new Error("columnKey not found");
      }

      switch (columnKey) {
        case "title":
          return {
            kind: GridCellKind.Text,
            data: property.title,
            displayData: property.title,
            readonly: true,
            allowOverlay: false,
          };

        case "value":
          return {
            kind: GridCellKind.Custom,
            allowOverlay: true,
            copyData: property.value,
            data: {
              kind: "value-cell",
              tooltips: getTooltipsOfProperty(property),
              showTooltip,
              hideTooltip,
              property,
            } as ValueCellProps,
          };

        case "dataTypes":
          return {
            kind: GridCellKind.Bubble,
            data: property.dataTypes,
            allowOverlay: true,
          };
      }
    },
    [rowData, showTooltip, hideTooltip],
  );

  return getCellContent;
};
