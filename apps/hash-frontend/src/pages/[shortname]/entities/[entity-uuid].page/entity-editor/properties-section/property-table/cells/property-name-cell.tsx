import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import { customColors } from "@local/design-system/src/theme/palette";

import {
  getCellHorizontalPadding,
  getYCenter,
} from "../../../../../../../../components/grid/utils";
import { drawCellFadeOutGradient } from "../../../../../../../../components/grid/utils/draw-cell-fade-out-gradient";
import { drawVerticalIndentationLine } from "../../../../../../../../components/grid/utils/draw-vertical-indentation-line";
import { TableExpandStatus } from "../../../entity-editor-context";
import { PropertyRow } from "../types";

export interface PropertyNameCellProps {
  readonly kind: "property-name-cell";
  propertyRow: PropertyRow;
}

export type PropertyNameCell = CustomCell<PropertyNameCellProps>;

export const createRenderPropertyNameCell = (
  togglePropertyExpand: (id: string) => void,
  propertyExpandStatus: TableExpandStatus,
): CustomRenderer<PropertyNameCell> => {
  return {
    kind: GridCellKind.Custom,
    isMatch: (cell: CustomCell): cell is PropertyNameCell =>
      (cell.data as any).kind === "property-name-cell",
    draw: (args, cell) => {
      const { ctx, theme, rect, spriteManager } = args;
      const {
        children,
        depth,
        title,
        indent,
        verticalLinesForEachIndent,
        rowId,
        isArray,
      } = cell.data.propertyRow;

      const yCenter = getYCenter(args);
      const columnPadding = getCellHorizontalPadding(true);

      const indentMultiplier = 16;
      const indentWidth = indent * indentMultiplier;

      const textLeft = rect.x + columnPadding + indentWidth;

      // prepare to fill text
      const shouldBeLightColor = depth && !children.length;
      ctx.fillStyle = shouldBeLightColor
        ? customColors.gray[50]
        : theme.textHeader;
      ctx.font = theme.baseFontStyle;

      // fill text
      ctx.fillText(title, textLeft, yCenter);
      const textWidth = ctx.measureText(title).width;
      const listIconSize = 14;

      // draw list icon
      if (isArray) {
        spriteManager.drawSprite(
          "bpList",
          "normal",
          ctx,
          textLeft + textWidth + 8,
          yCenter - listIconSize / 2,
          listIconSize,
          theme,
        );
      }

      // prepare to draw indentation lines
      ctx.strokeStyle = customColors.gray[30];

      // draw horizontal indentation line
      if (depth) {
        let hLineLeft = textLeft - indentMultiplier;

        if (children.length) {
          hLineLeft -= indentMultiplier;
        }

        const hLineRight = hLineLeft + indentMultiplier / 2;

        ctx.beginPath();
        ctx.moveTo(hLineLeft, yCenter);
        ctx.lineTo(hLineRight, yCenter);
        ctx.stroke();
      }

      // draw vertical indentation lines for each indentation level
      if (depth || children.length) {
        for (let i = 0; i < verticalLinesForEachIndent.length; i++) {
          const dir = verticalLinesForEachIndent[i];

          if (dir) {
            const indentationLevel = i;
            const lineLeft =
              rect.x +
              columnPadding +
              indentMultiplier * (indentationLevel - 1);

            drawVerticalIndentationLine(args, lineLeft, dir);
          }
        }
      }

      // draw chevron icon
      if (children.length) {
        ctx.fillStyle = "white";
        const iconSize = 10;
        const iconCenter = textLeft - indentMultiplier;
        const iconLeft = iconCenter - iconSize / 2;
        const iconTop = yCenter - iconSize / 2;

        ctx.fillRect(iconLeft, iconTop, iconSize, iconSize);

        const expanded = propertyExpandStatus[rowId];

        args.spriteManager.drawSprite(
          expanded ? "bpChevronDown" : "bpChevronRight",
          "normal",
          ctx,
          iconLeft,
          iconTop,
          iconSize,
          { ...theme, fgIconHeader: customColors.gray[50] },
        );
      }

      drawCellFadeOutGradient(args);
    },
    onClick: (args) => {
      const { children, rowId } = args.cell.data.propertyRow;

      if (children.length) {
        togglePropertyExpand(rowId);
      }

      return undefined;
    },
  };
};
