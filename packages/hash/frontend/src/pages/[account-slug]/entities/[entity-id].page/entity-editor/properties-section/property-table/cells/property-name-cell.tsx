import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";
import { CustomGridIcon } from "../../../../../../../../components/GlideGlid/custom-grid-icons";
import { drawCellFadeOutGradient } from "../../../../../../../../components/GlideGlid/draw-cell-fade-out-gradient";
import {
  firstColumnPadding,
  getYCenter,
} from "../../../../../../../../components/GlideGlid/utils";
import { PropertyRow } from "../types";

export interface PropertyNameCellProps {
  readonly kind: "property-name-cell";
  property: PropertyRow;
}

export type PropertyNameCell = CustomCell<PropertyNameCellProps>;

type VerticalLineDir = "up" | "down" | "full";

const drawVerticalLine = (
  args: DrawArgs<CustomCell>,
  left: number,
  dir: VerticalLineDir,
) => {
  const { rect, ctx } = args;

  const yTop = rect.y;
  const yBottom = rect.y + rect.height;
  const yCenter = getYCenter(args);

  const top = dir === "down" ? yCenter - 0.5 : yTop;
  const bottom = dir === "up" ? yCenter + 0.5 : yBottom;

  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, bottom);
  ctx.stroke();
};

export const createRenderPropertyNameCell = (
  togglePropertyExpand: (id: string) => void,
  rowData: PropertyRow[],
): CustomRenderer<PropertyNameCell> => {
  return {
    kind: GridCellKind.Custom,
    isMatch: (cell: CustomCell): cell is PropertyNameCell =>
      (cell.data as any).kind === "property-name-cell",
    draw: (args, cell) => {
      const { ctx, theme, rect, row } = args;
      const { children, expanded, depth, title } = cell.data.property;

      const yCenter = getYCenter(args);
      ctx.fillStyle = theme.textHeader;

      const indentationLevel = !depth ? 0 : children.length ? depth : depth - 1;
      const indentationSize = 16;
      const indentation = indentationLevel * indentationSize;

      ctx.font = theme.baseFontStyle;
      const textLeft = rect.x + firstColumnPadding + indentation;
      ctx.fillText(title, textLeft, yCenter);

      if (depth) {
        ctx.strokeStyle = "red";
        const drawHorizontalLine = () => {
          let hLineLeft = textLeft - indentationSize;

          if (children.length) {
            hLineLeft -= indentationSize;
          }

          const hLineRight = hLineLeft + indentationSize / 2;

          ctx.beginPath();
          ctx.moveTo(hLineLeft, yCenter);
          ctx.lineTo(hLineRight, yCenter);
          ctx.stroke();
        };
        drawHorizontalLine();

        const drawVerticalLines = () => {
          drawVerticalLine(args, textLeft - indentationSize, "full");
        };

        drawVerticalLines();
      }

      if (children.length) {
        ctx.fillStyle = "white";
        const iconSize = 10;
        const iconCenter = textLeft - indentationSize;
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
