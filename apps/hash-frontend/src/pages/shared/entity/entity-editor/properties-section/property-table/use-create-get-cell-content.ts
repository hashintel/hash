import type { Item } from "@glideapps/glide-data-grid";
import { GridCellKind } from "@glideapps/glide-data-grid";
import { isValueMetadata } from "@local/hash-graph-types/entity";
import { getMergedDataTypeSchema } from "@local/hash-isomorphic-utils/data-types";
import { useCallback } from "react";

import type { BlankCell } from "../../../../../../components/grid/utils";
import { blankCell } from "../../../../../../components/grid/utils";
import type { UseGridTooltipResponse } from "../../../../../../components/grid/utils/use-grid-tooltip/types";
import type { ChipCell } from "../../../../chip-cell";
import { useEntityEditor } from "../../entity-editor-context";
import type { SummaryChipCell } from "../../shared/summary-chip-cell";
import { getPropertyCountSummary } from "../get-property-count-summary";
import type { ChangeTypeCell } from "./cells/change-type-cell";
import type { PropertyNameCell } from "./cells/property-name-cell";
import { getEditorSpecs } from "./cells/value-cell/editor-specs";
import type { ValueCell } from "./cells/value-cell/types";
import { propertyGridIndexes } from "./constants";
import { getTooltipsOfPropertyRow } from "./get-tooltips-of-property-row";
import type { PropertyRow } from "./types";

export const useCreateGetCellContent = (
  showTooltip: UseGridTooltipResponse["showTooltip"],
  hideTooltip: UseGridTooltipResponse["hideTooltip"],
) => {
  const { readonly, onTypeClick } = useEntityEditor();

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
          allowOverlay: readonly ? typeof row.value !== "undefined" : true,
          copyData: String(row.value),
          cursor: typeof row.value === "undefined" ? "default" : "pointer",
          data: {
            kind: "value-cell",
            tooltips: getTooltipsOfPropertyRow(row),
            showTooltip,
            hideTooltip,
            propertyRow: row,
            readonly,
          },
        };

        const {
          isArray,
          permittedDataTypes,
          permittedDataTypesIncludingChildren,
          valueMetadata,
        } = row;

        const shouldShowChangeTypeCell =
          (permittedDataTypes.length > 1 ||
            permittedDataTypes[0]?.schema.abstract) &&
          !isArray &&
          valueMetadata &&
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
                  propertyRow: row,
                  secondaryText: `(${valuesCount} with ${valueWord})`,
                  showTooltip,
                  hideTooltip,
                  tooltips: getTooltipsOfPropertyRow(row),
                },
              };
            }

            return valueCell;

          case "permittedDataTypes":
            if (hasChild) {
              return blankCell;
            }

            if (shouldShowChangeTypeCell) {
              if (!isValueMetadata(valueMetadata)) {
                throw new Error(
                  `Expected single value when showing change type cell`,
                );
              }

              const dataTypeId = valueMetadata.metadata.dataTypeId;

              const dataType = permittedDataTypesIncludingChildren.find(
                (type) => type.schema.$id === dataTypeId,
              );

              if (!dataType) {
                throw new Error(
                  "Expected a data type to be set on the value or at least one permitted data type",
                );
              }

              return {
                kind: GridCellKind.Custom,
                allowOverlay: false,
                readonly: true,
                copyData: dataType.schema.$id,
                cursor: "pointer",
                data: {
                  kind: "change-type-cell",
                  currentType: dataType.schema,
                  propertyRow: row,
                  valueCellOfThisRow: valueCell,
                },
              };
            }

            return {
              kind: GridCellKind.Custom,
              allowOverlay: true,
              readonly: true,
              copyData: row.permittedDataTypes
                .map((type) => type.schema.title)
                .join(", "),
              cursor: "pointer",
              data: {
                kind: "chip-cell",
                chips: row.permittedDataTypes.map((type) => {
                  const schema = getMergedDataTypeSchema(type.schema);

                  if ("anyOf" in schema) {
                    /**
                     * @todo H-4067: Support anyOf constraints (e.g. data types which can be 'string' or 'number')
                     */
                    throw new Error(
                      "Data types with different expected sets of constraints (anyOf) are not yet supported",
                    );
                  }

                  const editorSpec = getEditorSpecs(type.schema, schema);

                  return {
                    text: type.schema.title,
                    icon: { inbuiltIcon: editorSpec.gridIcon },
                    faIconDefinition: { icon: editorSpec.icon },
                    onClick: () => {
                      onTypeClick("dataType", type.schema.$id);
                    },
                  };
                }),
              },
            };
        }
      },
    [showTooltip, hideTooltip, readonly, onTypeClick],
  );

  return createGetCellContent;
};
