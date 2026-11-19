import { GridCellKind } from "@glideapps/glide-data-grid";

import { customColors } from "@hashintel/design-system/theme";

import { getYCenter } from "../../../components/grid/utils";
import { drawChipWithIcon } from "../../../components/grid/utils/draw-chip-with-icon";
import { InteractableManager } from "../../../components/grid/utils/interactable-manager";
import { getDataTypeCellLayout } from "./data-type-tree-cell/layout";

import type { GridTooltip } from "../../../components/grid/utils/use-grid-tooltip/types";
import type { DataTypeLabelPart } from "./shared/data-type-label-preview";
import type { CustomCell, CustomRenderer } from "@glideapps/glide-data-grid";

export type DataTypeTreeCell = CustomCell<{
  kind: "data-type-tree-cell";
  hierarchical: boolean;
  leftPadding: number;
  title: string;
  labelPreview?: DataTypeLabelPart[];
  showLabelExample: (
    tooltip: Omit<GridTooltip, "content" | "colIndex" | "rowIndex">,
  ) => void;
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

const treeIndent = 24;

export const renderDataTypeTreeCell: CustomRenderer<DataTypeTreeCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell): cell is DataTypeTreeCell =>
    "kind" in cell.data && cell.data.kind === "data-type-tree-cell",
  onSelect: ({ cell, posX, preventDefault }) => {
    const left = cell.data.leftPadding + cell.data.depth * treeIndent;
    if (
      cell.data.hierarchical &&
      cell.data.hasChildren &&
      posX >= left &&
      posX <= left + treeIndent
    ) {
      preventDefault();
    }
  },
  draw: (args, cell) => {
    const { ctx, rect, theme, spriteManager } = args;
    const {
      title,
      hierarchical,
      leftPadding,
      labelPreview,
      showLabelExample,
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
    const left = rect.x + leftPadding + depth * treeIndent;
    const centerY = rect.y + rect.height / 2;
    const interactables = [];

    ctx.save();
    ctx.strokeStyle = customColors.gray[30];
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const ancestorDepth of continuationDepths) {
      const ancestorX =
        Math.floor(rect.x + leftPadding + ancestorDepth * treeIndent + 11) +
        0.5;
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

    const chipLeft = left + (hierarchical ? 28 : 0);
    const right = rect.x + rect.width - 16;
    const previewFont = (kind: DataTypeLabelPart["kind"]) =>
      `${kind === "placeholder" ? "italic 12px" : "13px"} ${theme.fontFamily}`;
    ctx.font = theme.baseFontStyle;
    const layout = getDataTypeCellLayout({
      title,
      preview: labelPreview,
      availableWidth: Math.max(0, right - chipLeft),
      measure: (text, kind) => {
        ctx.font = kind ? previewFont(kind) : theme.baseFontStyle;
        return ctx.measureText(text).width;
      },
    });
    ctx.save();
    ctx.beginPath();
    ctx.rect(chipLeft, rect.y, layout.chipAreaWidth, rect.height);
    ctx.clip();
    const { width, height, top } = drawChipWithIcon({
      args,
      left: chipLeft,
      text: layout.title,
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
    ctx.restore();
    interactables.push(
      InteractableManager.createCellInteractable(args, {
        id: "open",
        posRelativeToVisibleGridArea: {
          left: chipLeft,
          right: Math.min(chipLeft + width + 16, right),
          top,
          bottom: top + height,
        },
        onClick: onOpen,
      }),
    );

    if (layout.preview.length) {
      ctx.save();
      ctx.font = previewFont("label");
      const previewY = getYCenter(args);
      let previewLeft = right - layout.previewWidth;
      for (const part of layout.preview) {
        ctx.font = previewFont(part.kind);
        ctx.fillStyle = muted
          ? customColors.gray[60]
          : part.kind === "label"
            ? customColors.gray[80]
            : customColors.gray[70];
        ctx.fillText(part.text, previewLeft, previewY);
        previewLeft += ctx.measureText(part.text).width;
      }
      ctx.restore();
      interactables.push(
        InteractableManager.createCellInteractable(args, {
          id: "label-example",
          posRelativeToVisibleGridArea: {
            left: right - layout.previewWidth - 4,
            right: right + 4,
            top: rect.y,
            bottom: rect.y + rect.height,
          },
          onMouseEnter: () =>
            showLabelExample({
              horizontalAlign: "left",
              interactablePosRelativeToCell: {
                right: 12,
                top: 0,
              },
              interactableSize: {
                width: layout.previewWidth + 8,
                height: rect.height,
              },
            }),
        }),
      );
    }

    InteractableManager.setInteractablesForCell(args, interactables);
  },
};
