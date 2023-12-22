import { JsonValue } from "@blockprotocol/core";
import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import { customColors } from "@hashintel/design-system/theme";
import {
  formatDataValue,
  FormattedValuePart,
} from "@local/hash-isomorphic-utils/data-types";
import { DataTypeWithMetadata } from "@local/hash-subgraph";

import {
  getCellHorizontalPadding,
  getYCenter,
} from "../../../../../../../../components/grid/utils";
import { drawChipWithText } from "../../../../../../../../components/grid/utils/draw-chip-with-text";
import { drawTextWithIcon } from "../../../../../../../../components/grid/utils/draw-text-with-icon";
import { InteractableManager } from "../../../../../../../../components/grid/utils/interactable-manager";
import { drawInteractableTooltipIcons } from "../../../../../../../../components/grid/utils/use-grid-tooltip/draw-interactable-tooltip-icons";
import { isValueEmpty } from "../../is-value-empty";
import { ArrayEditor } from "./value-cell/array-editor";
import { editorSpecs } from "./value-cell/editor-specs";
import { SingleValueEditor } from "./value-cell/single-value-editor";
import { ValueCell } from "./value-cell/types";
import { guessEditorTypeFromValue } from "./value-cell/utils";

const guessDataTypeFromValue = (
  value: JsonValue,
  expectedTypes: DataTypeWithMetadata["schema"][],
) => {
  const editorType = guessEditorTypeFromValue(value, expectedTypes);

  const expectedType = expectedTypes.find((type) => type.type === editorType);
  if (!expectedType) {
    throw new Error(
      `Could not find guessed editor type ${editorType} among expected types ${expectedTypes
        .map((opt) => opt.$id)
        .join(", ")}`,
    );
  }

  return expectedType;
};

export const renderValueCell: CustomRenderer<ValueCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is ValueCell =>
    (cell.data as any).kind === "value-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    const { value, expectedTypes, isArray } = cell.data.propertyRow;

    ctx.fillStyle = theme.textHeader;
    ctx.font = theme.baseFontStyle;

    const yCenter = getYCenter(args);
    const left = rect.x + getCellHorizontalPadding();

    const editorType = guessEditorTypeFromValue(value, expectedTypes);
    const editorSpec = editorSpecs[editorType];

    if (isValueEmpty(value)) {
      // draw empty value
      ctx.fillStyle = customColors.gray[50];
      ctx.font = "italic 14px Inter";
      const emptyText = isArray ? "No values" : "No value";
      ctx.fillText(emptyText, left, yCenter);
    } else if (!isArray && editorSpec.shouldBeDrawnAsAChip) {
      const expectedType = guessDataTypeFromValue(
        value as JsonValue,
        expectedTypes,
      );

      drawChipWithText({
        args,
        left,
        text: formatDataValue(value as JsonValue, expectedType)
          .map((part) => part.text)
          .join(""),
      });
    } else if (editorType === "boolean") {
      const expectedType = guessDataTypeFromValue(
        value as JsonValue,
        expectedTypes,
      );

      // draw boolean
      drawTextWithIcon({
        args,
        text: formatDataValue(value as JsonValue, expectedType)
          .map((part) => part.text)
          .join(""),
        icon: value ? "bpCheck" : "bpCross",
        left,
        iconColor: customColors.gray[50],
        iconSize: 16,
      });
    } else {
      const valueParts: FormattedValuePart[] = [];
      if (Array.isArray(value)) {
        for (const [index, entry] of value.entries()) {
          const expectedType = guessDataTypeFromValue(
            entry as JsonValue,
            expectedTypes,
          );
          valueParts.push(...formatDataValue(entry as JsonValue, expectedType));
          if (index < value.length - 1) {
            valueParts.push({
              text: ", ",
              color: customColors.gray[50],
              type: "rightLabel",
            });
          }
        }
      } else {
        const expectedType = guessDataTypeFromValue(
          value as JsonValue,
          expectedTypes,
        );
        valueParts.push(...formatDataValue(value as JsonValue, expectedType));
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
  provideEditor: ({ data }) => {
    return {
      disableStyling: true,
      disablePadding: true,
      editor: data.propertyRow.isArray ? ArrayEditor : SingleValueEditor,
    };
  },
};
