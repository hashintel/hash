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

export interface LinkedWithCellProps {
  readonly kind: "linked-with-cell";
  linkRow: LinkRow;
}

export type LinkedWithCell = CustomCell<LinkedWithCellProps>;

export const renderLinkedWithCell: CustomRenderer<LinkedWithCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is LinkedWithCell =>
    (cell.data as any).kind === "linked-with-cell",
  draw: (args, cell) => {
    const { rect, ctx, theme } = args;
    const { linkRow } = cell.data;

    ctx.fillStyle = theme.textHeader;
    ctx.font = theme.baseFontStyle;

    const yCenter = getYCenter(args);
    const left = rect.x + getCellHorizontalPadding();

    const linkedEntity = linkRow.linkAndTargetEntities[0]?.rightEntity;

    if (!linkedEntity) {
      // draw empty value
      ctx.fillStyle = "#91A5BA";
      ctx.font = "italic 14px Inter";
      ctx.fillText("No entity", left, yCenter);
    } else {
      drawTextWithIcon({
        args,
        icon: "bpAsterisk",
        text: generateEntityLabel(linkRow.entitySubgraph, linkedEntity),
        left,
        iconSize: 12,
        gap: 5,
      });
    }

    drawCellFadeOutGradient(args);
  },
  provideEditor: () => {
    return {
      styleOverride: { boxShadow: "none", background: "transparent" },
      disablePadding: true,
      editor: LinkedWithCellEditor,
    };
  },
};
