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
import { drawCellFadeOutGradient } from "../../../../../../../../components/grid/utils/draw-cell-fade-out-gradient";
import { LinkRow } from "../types";
import { LinkedWithCellEditor } from "./linked-with-cell/linked-with-cell-editor";
import { generateEntityLabel } from "../../../../../../../../lib/entities";
import { InteractableManager } from "../../../../../../../../components/grid/utils/interactable-manager";
import { drawChipWithIcon } from "../../../../../../../../components/grid/utils/draw-chip-with-icon";

export interface LinkedWithCellProps {
  readonly kind: "linked-with-cell";
  linkRow: LinkRow;
}

export type LinkedWithCell = CustomCell<LinkedWithCellProps>;

export const renderLinkedWithCell: CustomRenderer<LinkedWithCell> = {
  kind: GridCellKind.Custom,
  needsHover: true,
  isMatch: (cell: CustomCell): cell is LinkedWithCell =>
    (cell.data as any).kind === "linked-with-cell",
  draw: (args, cell) => {
    const { rect, ctx, theme, spriteManager, hoverAmount, highlighted } = args;
    const { linkAndTargetEntities, entitySubgraph, deleteLink, maxItems } =
      cell.data.linkRow;

    ctx.fillStyle = theme.textHeader;
    ctx.font = theme.baseFontStyle;

    const yCenter = getYCenter(args);
    const cellPadding = getCellHorizontalPadding();
    const left = rect.x + cellPadding;

    // if there is no linked entity, draw empty state
    if (!linkAndTargetEntities.length) {
      ctx.fillStyle = customColors.gray[50];
      ctx.font = "italic 14px Inter";

      const emptyText = maxItems === 1 ? "No entity" : "No entities";
      ctx.fillText(emptyText, left, yCenter);

      return drawCellFadeOutGradient(args);
    }

    let accumulatedLeft = rect.x + cellPadding;
    const chipGap = 8;

    const sortedLinkedEntityLabels = [...linkAndTargetEntities]
      .sort((a, b) =>
        a.linkEntity.metadata.editionId.version.localeCompare(
          b.linkEntity.metadata.editionId.version,
        ),
      )
      .map(({ rightEntity }) =>
        generateEntityLabel(entitySubgraph, rightEntity),
      );

    // draw linked entity chips
    for (const label of sortedLinkedEntityLabels) {
      const chipWidth = drawChipWithIcon(args, label, accumulatedLeft);
      accumulatedLeft += chipWidth + chipGap;
    }

    // do not draw delete button if multiple links are allowed
    if (maxItems > 1) {
      const overflowed = accumulatedLeft > rect.x + rect.width;

      if (!overflowed) {
        return drawCellFadeOutGradient(args);
      }

      const text = `SEE ALL (${sortedLinkedEntityLabels.length})`;
      ctx.font = "700 14px Inter";
      const textWidth = ctx.measureText(text).width;

      drawCellFadeOutGradient(args, textWidth + 10, 0.8);

      ctx.fillStyle = customColors.blue[70];
      ctx.fillText(text, rect.x + rect.width - textWidth - 10, yCenter);

      return;
    }

    // draw delete button
    const iconSize = 16;
    const buttonRight = rect.x + rect.width - cellPadding;

    drawCellFadeOutGradient(args, iconSize + cellPadding);

    const deleteButton = InteractableManager.create(args, {
      id: "delete",
      pos: {
        left: buttonRight - iconSize,
        right: buttonRight,
        top: yCenter - iconSize / 2,
        bottom: yCenter + iconSize / 2,
      },
      onClick: () => {
        void deleteLink(
          linkAndTargetEntities[0]?.linkEntity.metadata.editionId.baseId!,
        );
      },
    });

    spriteManager.drawSprite(
      "bpTrash",
      "normal",
      ctx,
      deleteButton.pos.left,
      deleteButton.pos.top,
      iconSize,
      {
        ...theme,
        fgIconHeader: deleteButton.hovered
          ? customColors.red[70]
          : theme.fgIconHeader,
      },
      hoverAmount > 0 ? hoverAmount : highlighted ? 1 : 0,
    );

    InteractableManager.setInteractablesForCell(args, [deleteButton]);
  },
  provideEditor: () => {
    return {
      styleOverride: { boxShadow: "none", background: "transparent" },
      disablePadding: true,
      editor: LinkedWithCellEditor,
    };
  },
};
