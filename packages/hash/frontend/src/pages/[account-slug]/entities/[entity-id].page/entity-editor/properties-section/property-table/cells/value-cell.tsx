import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import { TextField } from "@hashintel/hash-design-system";
import { TooltipCellProps } from "../../../../../../../../components/GlideGlid/use-grid-tooltip/types";
import { EnrichedPropertyType } from "../types";

export interface ValueCellProps extends TooltipCellProps {
  readonly kind: "value-cell";
  property: EnrichedPropertyType;
}

export type ValueCell = CustomCell<ValueCellProps>;

export const renderValueCell: CustomRenderer<ValueCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is ValueCell =>
    (cell.data as any).kind === "value-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    const { x, y, height } = rect;
    const {
      data: { property },
    } = cell;

    const yCenter = y + height / 2 + 2;

    ctx.fillStyle = theme.textHeader;
    ctx.fillText(property.value, x + theme.cellHorizontalPadding, yCenter);
  },
  provideEditor: (cell) => {
    if (typeof cell.data.property.value !== "string") {
      return undefined;
    }

    // string editor
    return {
      styleOverride: { boxShadow: "none" },
      disablePadding: true,
      editor: (props) => {
        const { onChange, value } = props;

        return (
          <TextField
            sx={{ my: "1px" }}
            autoFocus
            value={value.data.property.value}
            onChange={(event) => {
              const newValue = { ...props.value };
              newValue.data.property.value = event.target.value;
              onChange(newValue);
            }}
          />
        );
      },
    };
  },
};
