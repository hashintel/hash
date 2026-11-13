import { GridCellKind } from "@glideapps/glide-data-grid";

import { customColors } from "@hashintel/design-system/theme";

import { drawCellFadeOutGradient } from "../../../components/grid/utils/draw-cell-fade-out-gradient";
import { drawChipWithIcon } from "../../../components/grid/utils/draw-chip-with-icon";
import { InteractableManager } from "../../../components/grid/utils/interactable-manager";

import type { CustomCell, CustomRenderer } from "@glideapps/glide-data-grid";

export type DataTypeTreeCell = CustomCell<{
  kind: "data-type-tree-cell";
  title: string;
  icon?: string;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  muted: boolean;
  onToggle: () => void;
  onOpen: () => void;
}>;

export const renderDataTypeTreeCell: CustomRenderer<DataTypeTreeCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell): cell is DataTypeTreeCell =>
    "kind" in cell.data && cell.data.kind === "data-type-tree-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme, spriteManager } = args;
    const {
      title,
      icon,
      depth,
      expanded,
      hasChildren,
      muted,
      onToggle,
      onOpen,
    } = cell.data;
    const left = rect.x + 16 + depth * 24;
    const centerY = rect.y + rect.height / 2;
    const interactables = [];

    if (depth > 0) {
      ctx.strokeStyle = customColors.gray[30];
      ctx.beginPath();
      ctx.moveTo(left - 12, rect.y);
      ctx.lineTo(left - 12, centerY);
      ctx.lineTo(left - 4, centerY);
      ctx.stroke();
    }

    if (hasChildren) {
      spriteManager.drawSprite(
        expanded ? "bpChevronDown" : "bpChevronRight",
        "normal",
        ctx,
        left + 6,
        centerY - 5,
        10,
        { ...theme, fgIconHeader: customColors.gray[70] },
      );
      interactables.push(
        InteractableManager.createCellInteractable(args, {
          id: "toggle",
          posRelativeToVisibleGridArea: {
            left,
            right: left + 24,
            top: rect.y,
            bottom: rect.y + rect.height,
          },
          onClick: onToggle,
        }),
      );
    }

    const chipLeft = left + 28;
    const { width, height, top } = drawChipWithIcon({
      args,
      left: chipLeft,
      text: title,
      icon: icon ? { entityTypeIcon: icon } : { inbuiltIcon: "bpAsterisk" },
      iconFill: muted ? customColors.gray[70] : customColors.blue[70],
      color: muted ? "gray" : "white",
      variant: "outlined",
    });
    spriteManager.drawSprite(
      "arrowUpRightRegular",
      "normal",
      ctx,
      chipLeft + width + 4,
      top + 6,
      12,
      {
        ...theme,
        fgIconHeader: muted ? customColors.gray[70] : customColors.blue[70],
      },
    );
    interactables.push(
      InteractableManager.createCellInteractable(args, {
        id: "open",
        posRelativeToVisibleGridArea: {
          left: chipLeft,
          right: chipLeft + width + 16,
          top,
          bottom: top + height,
        },
        onClick: onOpen,
      }),
    );

    InteractableManager.setInteractablesForCell(args, interactables);
    drawCellFadeOutGradient(args);
  },
};
