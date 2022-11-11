import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import { getYCenter } from "../../../../../../../../components/GlideGlid/utils";
import { InteractableManager } from "../../../../../../../../components/GlideGlid/utils/interactable-manager";
import { GridTooltipManager } from "../../../../../../../../components/GlideGlid/utils/use-grid-tooltip/grid-tooltip-manager";
import { ValueCell } from "./value-cell/types";
import { ValueCellEditor } from "./value-cell/value-cell-editor";

export const renderValueCell: CustomRenderer<ValueCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is ValueCell =>
    (cell.data as any).kind === "value-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    const { value } = cell.data.property;

    ctx.fillStyle = theme.textHeader;
    ctx.font = theme.baseFontStyle;

    const yCenter = getYCenter(args);

    ctx.fillText(String(value), rect.x + theme.cellHorizontalPadding, yCenter);

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
