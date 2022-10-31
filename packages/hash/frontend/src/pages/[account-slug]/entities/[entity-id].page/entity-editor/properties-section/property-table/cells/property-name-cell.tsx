import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import { CustomGridIcon } from "../../../../../../../../components/GlideGlid/custom-grid-icons";
import { drawCellFadeOutGradient } from "../../../../../../../../components/GlideGlid/draw-cell-fade-out-gradient";
import {
  drawVerticalLine,
  firstColumnPadding,
  getYCenter,
  VerticalLineDir,
} from "../../../../../../../../components/GlideGlid/utils";
import { PropertyRow } from "../types";

export interface PropertyNameCellProps {
  readonly kind: "property-name-cell";
  property: PropertyRow;
}

export type PropertyNameCell = CustomCell<PropertyNameCellProps>;

export const createRenderPropertyNameCell = (
  togglePropertyExpand: (id: string) => void,
): CustomRenderer<PropertyNameCell> => {
  return {
    kind: GridCellKind.Custom,
    isMatch: (cell: CustomCell): cell is PropertyNameCell =>
      (cell.data as any).kind === "property-name-cell",
    draw: (args, cell) => {
      const { ctx, theme, rect } = args;
      const {
        children,
        expanded,
        depth,
        title,
        indent,
        verticalLinesForEachIndent,
      } = cell.data.property;

      const yCenter = getYCenter(args);
      ctx.fillStyle = theme.textHeader;

      const indentMultiplier = 16;
      const indentWidth = indent * indentMultiplier;

      ctx.font = theme.baseFontStyle;
      const textLeft = rect.x + firstColumnPadding + indentWidth;

      const shouldBeLightColor = depth && !children.length;
      if (shouldBeLightColor) {
        ctx.fillStyle = "#91A5BA";
      }
      ctx.fillText(title, textLeft, yCenter);

      ctx.strokeStyle = "#DDE7F0";
      if (depth) {
        const drawHorizontalLine = () => {
          let hLineLeft = textLeft - indentMultiplier;

          if (children.length) {
            hLineLeft -= indentMultiplier;
          }

          const hLineRight = hLineLeft + indentMultiplier / 2;

          ctx.beginPath();
          ctx.moveTo(hLineLeft, yCenter);
          ctx.lineTo(hLineRight, yCenter);
          ctx.stroke();
        };

        drawHorizontalLine();
      }

      if (depth || children.length) {
        const drawVerticalLineOnIndent = (
          level: number,
          dir: VerticalLineDir,
        ) => {
          const lineLeft =
            rect.x + firstColumnPadding + indentMultiplier * (level - 1);

          drawVerticalLine(args, lineLeft, dir);
        };

        // eslint-disable-next-line unicorn/no-array-for-each
        verticalLinesForEachIndent.forEach((dir, index) => {
          drawVerticalLineOnIndent(index, dir);
        });
      }

      if (children.length) {
        ctx.fillStyle = "white";
        const iconSize = 10;
        const iconCenter = textLeft - indentMultiplier;
        const iconLeft = iconCenter - iconSize / 2;
        const iconTop = yCenter - iconSize / 2;

        ctx.fillRect(iconLeft, iconTop, iconSize, iconSize);

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
      const { children, propertyTypeBaseUri } = args.cell.data.property;

      if (children.length) {
        togglePropertyExpand(propertyTypeBaseUri);
      }

      return undefined;
    },
  };
};
