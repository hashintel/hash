import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import { drawCellFadeOutGradient } from "../../../../../../../../components/GlideGlid/draw-cell-fade-out-gradient";
import { firstColumnPadding } from "../../../../../../../../components/GlideGlid/utils";
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
      const { children, expanded, depth, title } = cell.data.property;

      const yCenter = rect.y + rect.height / 2 + 2;
      ctx.fillStyle = theme.textHeader;

      ctx.font = theme.baseFontStyle;
      ctx.fillText(
        `${depth ? `(${depth}) ` : ""}${title}`,
        rect.x + firstColumnPadding,
        yCenter,
      );

      if (children.length > 0) {
        ctx.fillStyle = "black";
        ctx.font = "bold 30px serif";
        ctx.fillText(expanded ? "-" : "+", rect.x + 8, yCenter);
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
