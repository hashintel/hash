import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import { customColors } from "@hashintel/design-system/theme";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { EntityId } from "@local/hash-subgraph";

import {
  getCellHorizontalPadding,
  getYCenter,
} from "../../../../../../../../components/grid/utils";
import { drawCellFadeOutGradient } from "../../../../../../../../components/grid/utils/draw-cell-fade-out-gradient";
import { drawChipWithIcon } from "../../../../../../../../components/grid/utils/draw-chip-with-icon";
import { InteractableManager } from "../../../../../../../../components/grid/utils/interactable-manager";
import { Interactable } from "../../../../../../../../components/grid/utils/interactable-manager/types";
import { getImageUrlFromEntityProperties } from "../../../../../../../shared/get-image-url-from-properties";
import { LinkRow } from "../types";
import { LinkedWithCellEditor } from "./linked-with-cell/linked-with-cell-editor";
import { sortLinkAndTargetEntities } from "./sort-link-and-target-entities";

export interface LinkedWithCellProps {
  readonly kind: "linked-with-cell";
  linkRow: LinkRow;
  readonly: boolean;
}

export type LinkedWithCell = CustomCell<LinkedWithCellProps>;

export const renderLinkedWithCell: CustomRenderer<LinkedWithCell> = {
  kind: GridCellKind.Custom,
  needsHover: true,
  isMatch: (cell: CustomCell): cell is LinkedWithCell =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cell.data as any).kind === "linked-with-cell",
  draw: (args, cell) => {
    const { rect, ctx, theme, spriteManager, hoverAmount, highlighted } = args;
    const { linkRow, readonly } = cell.data;
    const {
      linkAndTargetEntities,
      markLinkAsArchived,
      onEntityClick,
      isFile,
      isList,
      isUploading,
      isErroredUpload,
      retryErroredUpload,
    } = linkRow;

    ctx.fillStyle = theme.textHeader;
    ctx.font = theme.baseFontStyle;

    const yCenter = getYCenter(args);
    const cellPadding = getCellHorizontalPadding();
    const left = rect.x + cellPadding;

    if (isUploading || isErroredUpload || !linkAndTargetEntities.length) {
      ctx.fillStyle = isFile ? customColors.gray[90] : customColors.gray[50];
      ctx.font = isFile ? "14px Inter" : "italic 14px Inter";

      const text =
        isFile && isUploading
          ? "Uploading file, don't close your browser..."
          : isErroredUpload
            ? "Error uploading file"
            : isFile
              ? `No file${isList ? "s" : ""}`
              : isList
                ? "No entities"
                : "No entity";

      let leftDrawPosition = left;

      if (isErroredUpload) {
        // If we have an errored upload, draw a warning indicator
        const warningIconWidth = 14;
        args.spriteManager.drawSprite(
          "warning",
          "normal",
          ctx,
          leftDrawPosition,
          yCenter - warningIconWidth / 2 - 1,
          warningIconWidth,
          { ...theme, fgIconHeader: customColors.yellow[80] },
        );

        leftDrawPosition = leftDrawPosition + warningIconWidth + 6;
      }

      ctx.fillText(text, leftDrawPosition, yCenter);
      const textWidth = ctx.measureText(text).width;

      const interactables: Interactable[] = [];

      if (isErroredUpload) {
        // If we have an errored upload, add a retry button
        leftDrawPosition = leftDrawPosition + textWidth + 10;

        const retryIconWidth = 14;
        interactables.push(
          InteractableManager.createCellInteractable(args, {
            id: `${cell.data.linkRow.rowId}-retry-upload`,
            pos: {
              left: leftDrawPosition,
              right: leftDrawPosition + retryIconWidth,
              top: yCenter - retryIconWidth / 2,
              bottom: yCenter + retryIconWidth / 2,
            },
            onClick: () => {
              retryErroredUpload?.();
            },
          }),
        );

        args.spriteManager.drawSprite(
          "arrowRotateLeft",
          "normal",
          ctx,
          leftDrawPosition,
          yCenter - retryIconWidth / 2 - 1,
          retryIconWidth,
          { ...theme, fgIconHeader: customColors.gray[50] },
        );
      }

      // even if interactables is empty, we set it to clear any stale interactables saved on previous draw
      InteractableManager.setInteractablesForCell(args, interactables);
      return drawCellFadeOutGradient(args);
    }

    let accumulatedLeft = rect.x + cellPadding;
    const chipGap = 8;

    const sortedLinkedEntities = sortLinkAndTargetEntities(
      linkAndTargetEntities,
    );

    const entityChipInteractables: Interactable[] = [];

    // draw linked entity chips
    for (const { rightEntity, sourceSubgraph } of sortedLinkedEntities) {
      const label = generateEntityLabel(sourceSubgraph, rightEntity);

      const imageSrc = getImageUrlFromEntityProperties(rightEntity.properties);

      const chipWidth = drawChipWithIcon({
        args,
        color: "white",
        imageSrc,
        text: label,
        left: accumulatedLeft,
      });

      entityChipInteractables.push(
        InteractableManager.createCellInteractable(args, {
          id: rightEntity.metadata.recordId.entityId,
          pos: {
            left: accumulatedLeft,
            right: accumulatedLeft + chipWidth,
            top: yCenter - 16,
            bottom: yCenter + 16,
          },
          onClick: () => {
            onEntityClick({ entity: rightEntity });
          },
        }),
      );

      accumulatedLeft += chipWidth + chipGap;
    }

    InteractableManager.setInteractablesForCell(args, entityChipInteractables);

    // do not draw delete button if multiple links are allowed
    if (isList) {
      const overflowed = accumulatedLeft > rect.x + rect.width;

      if (!overflowed || sortedLinkedEntities.length <= 1) {
        return drawCellFadeOutGradient(args);
      }

      const text = `SEE ALL (${sortedLinkedEntities.length})`;
      ctx.font = "700 14px Inter";
      const textWidth = ctx.measureText(text).width;

      drawCellFadeOutGradient(args, textWidth + 10, 0.8);

      ctx.fillStyle = customColors.blue[70];
      ctx.fillText(text, rect.x + rect.width - textWidth - 10, yCenter);

      return;
    }

    // do not draw delete button if readonly
    if (readonly) {
      return drawCellFadeOutGradient(args);
    }

    // draw delete button
    const iconSize = 16;
    const buttonRight = rect.x + rect.width - cellPadding;

    drawCellFadeOutGradient(args, iconSize + cellPadding);

    const deleteButton = InteractableManager.createCellInteractable(args, {
      id: "delete",
      pos: {
        left: buttonRight - iconSize,
        right: buttonRight,
        top: yCenter - iconSize / 2,
        bottom: yCenter + iconSize / 2,
      },
      onClick: () => {
        markLinkAsArchived(
          linkAndTargetEntities[0]?.linkEntity.metadata.recordId
            .entityId as EntityId,
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

    InteractableManager.setInteractablesForCell(args, [
      deleteButton,
      ...entityChipInteractables,
    ]);
  },
  provideEditor: () => {
    return {
      styleOverride: { boxShadow: "none", background: "transparent" },
      disablePadding: true,
      editor: LinkedWithCellEditor,
    };
  },
};
