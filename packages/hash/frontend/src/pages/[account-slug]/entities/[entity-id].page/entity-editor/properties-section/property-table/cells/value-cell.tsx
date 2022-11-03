import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import { getYCenter } from "../../../../../../../../components/GlideGlid/utils";
import { TooltipCellProps } from "../../../../../../../../components/GlideGlid/utils/use-grid-tooltip/types";
import { PropertyRow } from "../types";
import { ValueCellEditor } from "./value-cell/value-cell-editor";

export interface ValueCellProps extends TooltipCellProps {
  readonly kind: "value-cell";
  property: PropertyRow;
}

export type ValueCell = CustomCell<ValueCellProps>;

export const renderValueCell: CustomRenderer<ValueCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is ValueCell =>
    (cell.data as any).kind === "value-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    const { value } = cell.data.property;

    ctx.fillStyle = theme.textHeader;
    ctx.font = theme.baseFontStyle;

    const yCenter = getYCenter(args);

    ctx.fillText(String(value), rect.x + theme.cellHorizontalPadding, yCenter);
  },
  provideEditor: () => {
    return {
      styleOverride: { boxShadow: "none" },
      disablePadding: true,
      editor: ValueCellEditor,
    };
  },
};
