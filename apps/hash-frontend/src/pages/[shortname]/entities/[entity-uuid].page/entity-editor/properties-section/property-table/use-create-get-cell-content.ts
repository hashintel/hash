import { GridCellKind, Item } from "@glideapps/glide-data-grid";
import { useCallback } from "react";

import {
  BlankCell,
  blankCell,
} from "../../../../../../../components/grid/utils";
import { UseGridTooltipResponse } from "../../../../../../../components/grid/utils/use-grid-tooltip/types";
import { useEntityEditor } from "../../entity-editor-context";
import { getPropertyCountSummary } from "../get-property-count-summary";
import { isValueEmpty } from "../is-value-empty";
import { ChangeTypeCell } from "./cells/change-type-cell";
import { ChipCell } from "./cells/chip-cell";
import { PropertyNameCell } from "./cells/property-name-cell";
import { SummaryChipCell } from "./cells/summary-chip-cell";
import { editorSpecs } from "./cells/value-cell/editor-specs";
import { ValueCell } from "./cells/value-cell/types";
import {
  guessEditorTypeFromExpectedType,
  guessEditorTypeFromValue,
} from "./cells/value-cell/utils";
import { propertyGridIndexes } from "./constants";
import { getTooltipsOfPropertyRow } from "./get-tooltips-of-property-row";
import { PropertyRow } from "./types";

export const useCreateGetCellContent = (
  showTooltip: UseGridTooltipResponse["showTooltip"],
  hideTooltip: UseGridTooltipResponse["hideTooltip"],
) => {
  const { readonly } = useEntityEditor();

  const createGetCellContent = useCallback(
    (rows: PropertyRow[]) =>
      ([colIndex, rowIndex]: Item):
        | PropertyNameCell
        | SummaryChipCell
        | ValueCell
        | ChipCell
        | ChangeTypeCell
        | BlankCell => {
        const row = rows[rowIndex];

        const hasChild = !!row?.children.length;

        if (!row) {
          throw new Error("property not found");
        }

        const columnKey = propertyGridIndexes[colIndex];

        if (!columnKey) {
          throw new Error("columnKey not found");
        }

        // create valueCell here, because it's used in two places below
        const valueCell: ValueCell = {
          kind: GridCellKind.Custom,
          allowOverlay: !readonly,
          copyData: String(row.value),
          cursor: readonly ? "default" : "pointer",
          data: {
            kind: "value-cell",
            tooltips: getTooltipsOfPropertyRow(row),
            showTooltip,
            hideTooltip,
            propertyRow: row,
          },
        };

        const guessedType = guessEditorTypeFromValue(
          row.value,
          row.expectedTypes,
        );

        const isEmptyValue =
          isValueEmpty(row.value) &&
          guessedType !== "null" &&
          guessedType !== "emptyList";

        const shouldShowChangeTypeCell =
          row.expectedTypes.length > 1 &&
          !row.isArray &&
          !isEmptyValue &&
          !readonly;

        switch (columnKey) {
          case "title":
            return {
              kind: GridCellKind.Custom,
              allowOverlay: false,
              readonly: true,
              copyData: row.title,
              data: {
                kind: "property-name-cell",
                propertyRow: row,
              },
            };

          case "value":
            if (hasChild) {
              const { totalCount, notEmptyCount } = getPropertyCountSummary(
                row.children,
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

            return valueCell;

          case "expectedTypes":
            if (hasChild) {
              return blankCell;
            }

            if (shouldShowChangeTypeCell) {
              return {
                kind: GridCellKind.Custom,
                allowOverlay: false,
                readonly: true,
                copyData: guessedType,
                cursor: "pointer",
                data: {
                  kind: "change-type-cell",
                  currentType: editorSpecs[guessedType].title,
                  propertyRow: row,
                  valueCellOfThisRow: valueCell,
                },
              };
            }

            return {
              kind: GridCellKind.Custom,
              allowOverlay: true,
              readonly: true,
              copyData: String(row.expectedTypes),
              data: {
                kind: "chip-cell",
                chips: row.expectedTypes.map((type) => {
                  const editorSpec =
                    editorSpecs[guessEditorTypeFromExpectedType(type)];

                  return {
                    text: type,
                    icon: editorSpec.gridIcon,
                    faIconDefinition: { icon: editorSpec.icon },
                  };
                }),
              },
            };
        }
      },
    [showTooltip, hideTooltip, readonly],
  );

  return createGetCellContent;
};
