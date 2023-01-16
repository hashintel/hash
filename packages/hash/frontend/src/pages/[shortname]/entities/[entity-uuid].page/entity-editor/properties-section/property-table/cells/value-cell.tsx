import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import { customColors } from "@hashintel/hash-design-system/src/theme/palette";

import {
  getCellHorizontalPadding,
  getYCenter,
} from "../../../../../../../../components/grid/utils";
import { drawTextWithIcon } from "../../../../../../../../components/grid/utils/draw-text-with-icon";
import { InteractableManager } from "../../../../../../../../components/grid/utils/interactable-manager";
import { drawInteractableTooltipIcons } from "../../../../../../../../components/grid/utils/use-grid-tooltip/draw-interactable-tooltip-icons";
import { isValueEmpty } from "../../is-value-empty";
import { ArrayEditor } from "./value-cell/array-editor";
import { SingleValueEditor } from "./value-cell/single-value-editor";
import { ValueCell } from "./value-cell/types";
import { guessEditorTypeFromValue } from "./value-cell/utils";

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

    const isBoolean =
      guessEditorTypeFromValue(value, expectedTypes) === "boolean";

    if (isValueEmpty(value)) {
      // draw empty value
      ctx.fillStyle = customColors.gray[50];
      ctx.font = "italic 14px Inter";
      const emptyText = isArray ? "No values" : "No value";
      ctx.fillText(emptyText, left, yCenter);
    } else if (isBoolean) {
      // draw boolean
      drawTextWithIcon({
        args,
        text: value ? "True" : "False",
        icon: value ? "bpCheck" : "bpCross",
        left,
        iconColor: customColors.gray[50],
        iconSize: 16,
      });
    } else {
      // draw plain text
      const text = Array.isArray(value)
        ? value
            .map((val) =>
              typeof val === "boolean" ? (val ? "True" : "False") : val,
            )
            .join(", ")
        : String(value);
      ctx.fillText(text, left, yCenter);
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
