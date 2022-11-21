import { GridCell, GridCellKind, Item } from "@glideapps/glide-data-grid";
import { useCallback } from "react";
import { blankCell } from "../../../../../../../components/GlideGlid/utils";
import { getPropertyCountSummary } from "../get-property-count-summary";
import { SummaryChipCellProps } from "./cells/summary-chip-cell";
import { UseGridTooltipResponse } from "../../../../../../../components/GlideGlid/utils/use-grid-tooltip/types";
import { ChipCellProps } from "./cells/chip-cell";
import { PropertyNameCellProps } from "./cells/property-name-cell";
import { ValueCellProps } from "./cells/value-cell/types";
import { propertyGridIndexes } from "./constants";
import { getTooltipsOfPropertyRow } from "./get-tooltips-of-property-row";
import { PropertyRow } from "./types";

export const useCreateGetCellContent = (
  showTooltip: UseGridTooltipResponse["showTooltip"],
  hideTooltip: UseGridTooltipResponse["hideTooltip"],
) => {
  const createGetCellContent = useCallback(
    (rowData: PropertyRow[]) =>
      ([col, row]: Item): GridCell => {
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
              } as PropertyNameCellProps,
            };

          case "value":
            if (hasChild) {
              const { emptyCount, notEmptyCount } = getPropertyCountSummary(
                property.value,
              );

              const valuesCount = notEmptyCount || "none";
              const valueWord = notEmptyCount === 1 ? "a value" : "values";

              return {
                kind: GridCellKind.Custom,
                allowOverlay: false,
                copyData: "",
                data: {
                  kind: "summary-chip-cell",
                  primaryText: `${emptyCount + notEmptyCount} properties`,
                  secondaryText: `(${valuesCount} with ${valueWord})`,
                } as SummaryChipCellProps,
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
              } as ValueCellProps,
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
              } as ChipCellProps,
            };
        }
      },
    [showTooltip, hideTooltip],
  );

  return createGetCellContent;
};
