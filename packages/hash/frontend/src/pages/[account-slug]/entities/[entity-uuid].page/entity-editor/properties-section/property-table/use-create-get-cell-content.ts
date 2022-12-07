import { GridCellKind, Item } from "@glideapps/glide-data-grid";
import { useCallback } from "react";
import {
  BlankCell,
  blankCell,
} from "../../../../../../../components/grid/utils";
import { getPropertyCountSummary } from "../get-property-count-summary";
import { SummaryChipCell } from "./cells/summary-chip-cell";
import { UseGridTooltipResponse } from "../../../../../../../components/grid/utils/use-grid-tooltip/types";
import { ChipCell } from "./cells/chip-cell";
import { PropertyNameCell } from "./cells/property-name-cell";
import { ValueCell } from "./cells/value-cell/types";
import { propertyGridIndexes } from "./constants";
import { getTooltipsOfPropertyRow } from "./get-tooltips-of-property-row";
import { PropertyRow } from "./types";

export const useCreateGetCellContent = (
  showTooltip: UseGridTooltipResponse["showTooltip"],
  hideTooltip: UseGridTooltipResponse["hideTooltip"],
) => {
  const createGetCellContent = useCallback(
    (rowData: PropertyRow[]) =>
      ([col, row]: Item):
        | PropertyNameCell
        | SummaryChipCell
        | ValueCell
        | ChipCell
        | BlankCell => {
        const property = rowData[row];

        const hasChild = !!property?.children.length;

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
              },
            };

          case "value":
            if (hasChild) {
              const { totalCount, notEmptyCount } = getPropertyCountSummary(
                property.children,
              );

              const valuesCount = notEmptyCount || "none";
              const valueWord = notEmptyCount === 1 ? "a value" : "values";

              return {
                kind: GridCellKind.Custom,
                allowOverlay: false,
                copyData: "",
                data: {
                  kind: "summary-chip-cell",
                  primaryText: `${totalCount} properties`,
                  secondaryText: `(${valuesCount} with ${valueWord})`,
                },
              };
            }

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
              },
            };

          case "expectedTypes":
            if (hasChild) {
              return blankCell;
            }

            return {
              kind: GridCellKind.Custom,
              allowOverlay: true,
              readonly: true,
              copyData: String(property.expectedTypes),
              data: {
                kind: "chip-cell",
                chips: property.expectedTypes,
              },
            };
        }
      },
    [showTooltip, hideTooltip],
  );

  return createGetCellContent;
};
