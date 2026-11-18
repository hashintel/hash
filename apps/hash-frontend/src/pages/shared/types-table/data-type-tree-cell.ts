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
  continuationDepths: number[];
  hasNextSibling: boolean;
  expanded: boolean;
  hasChildren: boolean;
  muted: boolean;
  onToggle: () => void;
  onOpen: () => void;
}>;

const treeInset = 16;
const treeIndent = 24;

export const renderDataTypeTreeCell: CustomRenderer<DataTypeTreeCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell): cell is DataTypeTreeCell =>
    "kind" in cell.data && cell.data.kind === "data-type-tree-cell",
  onSelect: ({ cell, posX, preventDefault }) => {
    const left = treeInset + cell.data.depth * treeIndent;
    if (cell.data.hasChildren && posX >= left && posX <= left + treeIndent) {
      preventDefault();
    }
  },
  draw: (args, cell) => {
    const { ctx, rect, theme, spriteManager } = args;
    const {
      title,
      icon,
      depth,
      continuationDepths,
      hasNextSibling,
      expanded,
      hasChildren,
      muted,
      onToggle,
      onOpen,
    } = cell.data;
    const left = rect.x + treeInset + depth * treeIndent;
    const centerY = rect.y + rect.height / 2;
    const interactables = [];

    ctx.save();
    ctx.strokeStyle = customColors.gray[30];
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const ancestorDepth of continuationDepths) {
      const ancestorX =
        Math.floor(rect.x + treeInset + ancestorDepth * treeIndent + 11) + 0.5;
      ctx.moveTo(ancestorX, rect.y);
      ctx.lineTo(ancestorX, rect.y + rect.height);
    }
    if (depth > 0) {
      const parentX = Math.floor(left - treeIndent + 11) + 0.5;
      const branchY = Math.floor(centerY) + 0.5;
      ctx.moveTo(parentX, rect.y);
      ctx.lineTo(parentX, hasNextSibling ? rect.y + rect.height : branchY);
      ctx.moveTo(parentX, branchY);
      ctx.lineTo(hasChildren ? left + 3 : left + 24, branchY);
    }
    if (expanded) {
      const childX = Math.floor(left + 11) + 0.5;
      ctx.moveTo(childX, centerY + 7);
      ctx.lineTo(childX, rect.y + rect.height);
    }
    ctx.stroke();
    ctx.restore();

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
