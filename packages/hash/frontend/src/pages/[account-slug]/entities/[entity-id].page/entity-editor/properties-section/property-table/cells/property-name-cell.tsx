import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import {
  getColumnPadding,
  getYCenter,
} from "../../../../../../../../components/GlideGlid/utils";
import { CustomGridIcon } from "../../../../../../../../components/GlideGlid/utils/custom-grid-icons";
import { drawCellFadeOutGradient } from "../../../../../../../../components/GlideGlid/utils/draw-cell-fade-out-gradient";
import { drawVerticalLine } from "../../../../../../../../components/GlideGlid/utils/draw-vertical-line";
import { TableExpandStatus } from "../../../entity-editor-context";
import { PropertyRow } from "../types";

export interface PropertyNameCellProps {
  readonly kind: "property-name-cell";
  property: PropertyRow;
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
      const { ctx, theme, rect } = args;
      const {
        children,
        depth,
        title,
        indent,
        verticalLinesForEachIndent,
        rowId,
      } = cell.data.property;

      const yCenter = getYCenter(args);
      const columnPadding = getColumnPadding(true);

      const indentMultiplier = 16;
      const indentWidth = indent * indentMultiplier;

      const textLeft = rect.x + columnPadding + indentWidth;

      // prepare to fill text
      const shouldBeLightColor = depth && !children.length;
      ctx.fillStyle = shouldBeLightColor ? "#91A5BA" : theme.textHeader;
      ctx.font = theme.baseFontStyle;

      // fill text
      ctx.fillText(title, textLeft, yCenter);

      // prepare to draw indentation lines
      ctx.strokeStyle = "#DDE7F0";

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
        // eslint-disable-next-line unicorn/no-array-for-each
        verticalLinesForEachIndent.forEach((dir, index) => {
          const indentationLevel = index;
          const lineLeft =
            rect.x + columnPadding + indentMultiplier * (indentationLevel - 1);

          drawVerticalLine(args, lineLeft, dir);
        });
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
          expanded ? CustomGridIcon.CHEVRON_DOWN : CustomGridIcon.CHEVRON_RIGHT,
          "normal",
          ctx,
          iconLeft,
          iconTop,
          iconSize,
          { ...theme, fgIconHeader: "#91A5BA" },
        );
      }

      drawCellFadeOutGradient(args);
    },
    onClick: (args) => {
      const { children, rowId } = args.cell.data.property;

      if (children.length) {
        togglePropertyExpand(rowId);
      }

      return undefined;
    },
  };
};
