import { GridCell, GridCellKind, Item } from "@glideapps/glide-data-grid";
import { useCallback } from "react";
import { UseGridTooltipResponse } from "../../../../../../../components/GlideGlid/utils/use-grid-tooltip/types";
import { DataTypeCellProps } from "./cells/data-type-cell";
import { PropertyNameCellProps } from "./cells/property-name-cell";
import { ValueCellProps } from "./cells/value-cell/types";
import { propertyGridIndexes } from "./constants";
import { getTooltipsOfPropertyRow } from "./get-tooltips-of-property-row";
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
            kind: GridCellKind.Custom,
            allowOverlay: false,
            readonly: true,
            copyData: property.title,
            data: {
              kind: "property-name-cell",
              property,
            } as PropertyNameCellProps,
          };

        case "value":
          return {
            kind: GridCellKind.Custom,
            allowOverlay: true,
            copyData: String(property.value),
            cursor: "pointer",
            data: {
              kind: "value-cell",
              tooltips: getTooltipsOfPropertyRow(property),
              showTooltip,
              hideTooltip,
              property,
            } as ValueCellProps,
          };

        case "dataTypes":
          return {
            kind: GridCellKind.Custom,
            allowOverlay: true,
            readonly: true,
            copyData: String(property.dataTypes),
            data: {
              kind: "data-type-cell",
              property,
            } as DataTypeCellProps,
          };
      }
    },
    [rowData, showTooltip, hideTooltip],
  );

  return getCellContent;
};
