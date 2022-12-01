import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";

import {
  getCellHorizontalPadding,
  getYCenter,
} from "../../../../../../../../components/grid/utils";
import { drawTextWithIcon } from "../../../../../../../../components/grid/utils/draw-text-with-icon";
import { drawCellFadeOutGradient } from "../../../../../../../../components/grid/utils/draw-cell-fade-out-gradient";
import { LinkRow } from "../types";
import { LinkedWithCellEditor } from "./linked-with-cell/linked-with-cell-editor";
import { generateEntityLabel } from "../../../../../../../../lib/entities";
import { InteractableManager } from "../../../../../../../../components/grid/utils/interactable-manager";

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
    const { linkAndTargetEntities, entitySubgraph, deleteLink } =
      cell.data.linkRow;

    ctx.fillStyle = theme.textHeader;
    ctx.font = theme.baseFontStyle;

    const yCenter = getYCenter(args);
    const cellPadding = getCellHorizontalPadding();
    const left = rect.x + cellPadding;

    const linkAndTargetEntity = linkAndTargetEntities[0];

    if (!linkAndTargetEntity) {
      // draw empty value
      ctx.fillStyle = "#91A5BA";
      ctx.font = "italic 14px Inter";
      ctx.fillText("No entity", left, yCenter);

      return drawCellFadeOutGradient(args);
    }

    drawTextWithIcon({
      args,
      icon: "bpAsterisk",
      text: generateEntityLabel(
        entitySubgraph,
        linkAndTargetEntity.rightEntity,
      ),
      left,
      iconSize: 12,
      gap: 5,
    });

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
          linkAndTargetEntity.linkEntity.metadata.editionId.baseId,
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
        fgIconHeader: deleteButton.hovered ? "#DF3449" : theme.fgIconHeader,
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
