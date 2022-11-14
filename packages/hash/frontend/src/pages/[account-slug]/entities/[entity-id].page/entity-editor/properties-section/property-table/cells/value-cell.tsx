import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import { types } from "@hashintel/hash-shared/types";
import { InteractableManager } from "../../../../../../../../components/GlideGlid/utils/interactable-manager";
import { GridTooltipManager } from "../../../../../../../../components/GlideGlid/utils/use-grid-tooltip/grid-tooltip-manager";
import {
  getCellHorizontalPadding,
  getYCenter,
} from "../../../../../../../../components/GlideGlid/utils";
import { drawTextWithIcon } from "../../../../../../../../components/GlideGlid/utils/draw-text-with-icon";
import { isValueEmpty } from "../../is-value-empty";
import { ValueCell } from "./value-cell/types";
import { ValueCellEditor } from "./value-cell/value-cell-editor";

export const renderValueCell: CustomRenderer<ValueCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is ValueCell =>
    (cell.data as any).kind === "value-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    const { value, dataTypes } = cell.data.property;

    ctx.fillStyle = theme.textHeader;
    ctx.font = theme.baseFontStyle;

    const yCenter = getYCenter(args);
    const left = rect.x + getCellHorizontalPadding();

    /** @todo remove dataTypes[0] when multiple data types are supported */
    const isBoolean = dataTypes[0] === types.dataType.boolean.title;

    if (isValueEmpty(value)) {
      // draw empty value
      ctx.fillStyle = "#91A5BA";
      ctx.font = "italic 14px Inter";
      ctx.fillText("No value", left, yCenter);
    } else if (isBoolean) {
      // draw boolean
      return drawTextWithIcon({
        args,
        text: value ? "True" : "False",
        icon: value ? "bpCheck" : "bpCross",
        left,
        iconColor: "#91A5BA",
        iconSize: 16,
      });
    } else {
      // draw plain text
      ctx.fillText(String(value), left, yCenter);
    }

    const tooltipManager = new GridTooltipManager(args);
    const tooltipInteractables = tooltipManager.drawAndCreateInteractables();

    InteractableManager.setInteractablesForCell(args, tooltipInteractables);
  },
  provideEditor: () => {
    return {
      styleOverride: { boxShadow: "none" },
      disablePadding: true,
      editor: ValueCellEditor,
    };
  },
};
