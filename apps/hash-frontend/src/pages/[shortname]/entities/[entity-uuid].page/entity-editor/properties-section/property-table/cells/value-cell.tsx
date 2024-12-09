import type { JsonValue } from "@blockprotocol/core";
import type { CustomCell, CustomRenderer } from "@glideapps/glide-data-grid";
import { GridCellKind } from "@glideapps/glide-data-grid";
import { customColors } from "@hashintel/design-system/theme";
import {
  isArrayMetadata,
  isValueMetadata,
} from "@local/hash-graph-types/entity";
import type { FormattedValuePart } from "@local/hash-isomorphic-utils/data-types";
import {
  formatDataValue,
  getMergedDataTypeSchema,
} from "@local/hash-isomorphic-utils/data-types";

import {
  getCellHorizontalPadding,
  getYCenter,
} from "../../../../../../../../components/grid/utils";
import { drawChipWithText } from "../../../../../../../../components/grid/utils/draw-chip-with-text";
import { drawTextWithIcon } from "../../../../../../../../components/grid/utils/draw-text-with-icon";
import { drawUrlAsLink } from "../../../../../../../../components/grid/utils/draw-url-as-link";
import { InteractableManager } from "../../../../../../../../components/grid/utils/interactable-manager";
import { drawInteractableTooltipIcons } from "../../../../../../../../components/grid/utils/use-grid-tooltip/draw-interactable-tooltip-icons";
import { isValueEmpty } from "../../is-value-empty";
import { ArrayEditor } from "./value-cell/array-editor";
import { ReadonlyPopup } from "./value-cell/readonly-popup";
import { SingleValueEditor } from "./value-cell/single-value-editor";
import type { ValueCell } from "./value-cell/types";

export const renderValueCell: CustomRenderer<ValueCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is ValueCell =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cell.data as any).kind === "value-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;

    const { readonly } = cell.data;

    const { value, valueMetadata, permittedDataTypes, isArray, isSingleUrl } =
      cell.data.propertyRow;

    ctx.fillStyle = theme.textHeader;
    ctx.font = theme.baseFontStyle;

    const yCenter = getYCenter(args);
    const left = rect.x + getCellHorizontalPadding();

    if (isValueEmpty(value)) {
      // draw empty value
      ctx.fillStyle = customColors.gray[50];
      ctx.font = "italic 14px Inter";
      const emptyText = isArray ? "No values" : "No value";
      ctx.fillText(emptyText, left, yCenter);
    } else if (!isArray && typeof value === "object") {
      drawChipWithText({
        args,
        left,
        text: !value ? "null" : JSON.stringify(value),
      });
    } else if (typeof value === "boolean") {
      // draw boolean
      drawTextWithIcon({
        args,
        text: value.toString(),
        icon: value ? "bpCheck" : "bpCross",
        left,
        iconColor: customColors.gray[50],
        iconSize: 16,
      });
    } else if (readonly && isSingleUrl) {
      drawUrlAsLink({ args, url: value as string, left });
    } else {
      if (!valueMetadata) {
        throw new Error(
          `Expected value metadata to be set when value '${value}' is not empty`,
        );
      }

      const valueParts: FormattedValuePart[] = [];
      if (Array.isArray(value)) {
        for (const [index, entry] of value.entries()) {
          if (!isArrayMetadata(valueMetadata)) {
            throw new Error(
              `Expected array metadata for value '${JSON.stringify(value)}', got ${JSON.stringify(valueMetadata)}`,
            );
          }

          const arrayItemMetadata = valueMetadata.value[index];

          if (!arrayItemMetadata) {
            throw new Error(
              `Expected metadata for array item at index ${index} in value '${JSON.stringify(value)}'`,
            );
          }

          if (!isValueMetadata(arrayItemMetadata)) {
            throw new Error(
              `Expected single value metadata for array item at index ${index} in value '${JSON.stringify(value)}', got ${JSON.stringify(arrayItemMetadata)}`,
            );
          }

          const dataTypeId = arrayItemMetadata.metadata.dataTypeId;

          const dataType = permittedDataTypes.find(
            (type) => type.schema.$id === dataTypeId,
          );

          if (!dataType) {
            throw new Error(
              "Expected a data type to be set on the value or at least one permitted data type",
            );
          }

          const schema = getMergedDataTypeSchema(dataType.schema);

          if ("anyOf" in schema) {
            throw new Error(
              "Data types with different expected sets of constraints (anyOf) are not yet supported",
            );
          }

          valueParts.push(...formatDataValue(entry as JsonValue, schema));
          if (index < value.length - 1) {
            valueParts.push({
              text: ", ",
              color: customColors.gray[50],
              type: "rightLabel",
            });
          }
        }
      } else {
        if (!isValueMetadata(valueMetadata)) {
          throw new Error(
            `Expected single value metadata for value '${value}', got ${JSON.stringify(valueMetadata)}`,
          );
        }

        const dataTypeId = valueMetadata.metadata.dataTypeId;

        const dataType = permittedDataTypes.find(
          (type) => type.schema.$id === dataTypeId,
        );

        if (!dataType) {
          throw new Error(
            "Expected a data type to be set on the value or at least one permitted data type",
          );
        }

        const schema = getMergedDataTypeSchema(dataType.schema);

        if ("anyOf" in schema) {
          throw new Error(
            "Data types with different expected sets of constraints (anyOf) are not yet supported",
          );
        }

        valueParts.push(...formatDataValue(value as JsonValue, schema));
      }

      let textOffset = left;
      for (const [index, part] of valueParts.entries()) {
        ctx.fillStyle = part.color;
        ctx.fillText(part.text, textOffset, yCenter);

        const additionalRightPadding =
          part.type === "leftLabel"
            ? 0.5
            : part.type === "value" &&
                valueParts[index + 1]?.type === "rightLabel"
              ? 0.5
              : 0;

        textOffset += ctx.measureText(part.text).width + additionalRightPadding;
      }
    }

    const tooltipInteractables = drawInteractableTooltipIcons(args);
    InteractableManager.setInteractablesForCell(args, tooltipInteractables);
  },
  onClick: (args) => {
    if (args.cell.data.readonly && args.cell.data.propertyRow.isSingleUrl) {
      window.open(args.cell.data.propertyRow.value as string, "_blank");
    }
    return undefined;
  },
  provideEditor: ({ data }) => {
    if (data.readonly) {
      return {
        disableStyling: true,
        disablePadding: true,
        editor: ReadonlyPopup,
      };
    }

    return {
      disableStyling: true,
      disablePadding: true,
      editor: data.propertyRow.isArray ? ArrayEditor : SingleValueEditor,
    };
  },
};
