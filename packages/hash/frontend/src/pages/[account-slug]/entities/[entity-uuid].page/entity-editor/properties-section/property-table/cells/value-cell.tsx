import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import { types } from "@hashintel/hash-shared/ontology-types";
import { customColors } from "@hashintel/hash-design-system/src/theme/palette";
import { InteractableManager } from "../../../../../../../../components/grid/utils/interactable-manager";
import { drawInteractableTooltipIcons } from "../../../../../../../../components/grid/utils/use-grid-tooltip/draw-interactable-tooltip-icons";
import {
  getCellHorizontalPadding,
  getYCenter,
} from "../../../../../../../../components/grid/utils";
import { drawTextWithIcon } from "../../../../../../../../components/grid/utils/draw-text-with-icon";
import { isValueEmpty } from "../../is-value-empty";
import { ValueCell } from "./value-cell/types";
import { SingleValueEditor } from "./value-cell/single-value-editor";
import { ArrayEditor } from "./value-cell/array-editor";

export const renderValueCell: CustomRenderer<ValueCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is ValueCell =>
    (cell.data as any).kind === "value-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    const { value, expectedTypes } = cell.data.propertyRow;

    ctx.fillStyle = theme.textHeader;
    ctx.font = theme.baseFontStyle;

    const yCenter = getYCenter(args);
    const left = rect.x + getCellHorizontalPadding();

    /** @todo remove expectedTypes[0] when multiple data types are supported */
    const isBoolean = expectedTypes[0] === types.dataType.boolean.title;

    if (isValueEmpty(value)) {
      // draw empty value
      ctx.fillStyle = customColors.gray[50];
      ctx.font = "italic 14px Inter";
      ctx.fillText("No value", left, yCenter);
    } else if (isBoolean) {
      // draw boolean
      return drawTextWithIcon({
        args,
        text: value ? "True" : "False",
        icon: value ? "bpCheck" : "bpCross",
        left,
        iconColor: customColors.gray[50],
        iconSize: 16,
      });
    } else {
      // draw plain text
      const text = Array.isArray(value) ? value.join(", ") : String(value);
      ctx.fillText(text, left, yCenter);
    }

    const tooltipInteractables = drawInteractableTooltipIcons(args);
    InteractableManager.setInteractablesForCell(args, tooltipInteractables);
  },
  provideEditor: ({ data }) => {
    return {
      styleOverride: { boxShadow: "none", background: "transparent" },
      disablePadding: true,
      editor: data.propertyRow.isArray ? ArrayEditor : SingleValueEditor,
    };
  },
};
