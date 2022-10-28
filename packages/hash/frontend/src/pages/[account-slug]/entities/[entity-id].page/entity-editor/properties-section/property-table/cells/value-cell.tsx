import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";
import { isPlainObject } from "lodash";
import { TooltipCellProps } from "../../../../../../../../components/GlideGlid/use-grid-tooltip/types";
import {
  getYCenter,
  roundRect,
} from "../../../../../../../../components/GlideGlid/utils";
import { getNestedPropertySummary } from "../../get-empty-property-count";
import { PropertyRow } from "../types";
import { ValueCellEditor } from "./value-cell/value-cell-editor";

export interface ValueCellProps extends TooltipCellProps {
  readonly kind: "value-cell";
  property: PropertyRow;
}

export type ValueCell = CustomCell<ValueCellProps>;

const drawNestedPropertySummary = (args: DrawArgs<ValueCell>) => {
  const { ctx, rect, cell } = args;
  const yCenter = getYCenter(args);

  const { empty, notEmpty } = getNestedPropertySummary(
    cell.data.property.value,
  );

  const secondaryTextComponents = [];
  if (notEmpty) {
    secondaryTextComponents.push(`${notEmpty} value`);
  }
  if (empty) {
    secondaryTextComponents.push(`${empty} empty`);
  }

  const primaryText = `${empty + notEmpty} total`;
  const secondaryText = ` (${secondaryTextComponents.join(", ")})`;

  const left = rect.x + 20;
  const height = 26;
  const chipTop = yCenter - height / 2;
  const paddingX = 12;

  const primaryTextLeft = left + paddingX;
  const primaryTextWidth = ctx.measureText(primaryText).width;

  const secondaryTextLeft = primaryTextLeft + primaryTextWidth;
  const secondaryTextWidth = ctx.measureText(secondaryText).width;

  const chipWidth = primaryTextWidth + secondaryTextWidth + 2 * paddingX;

  ctx.strokeStyle = "#C1CFDE";
  ctx.beginPath();
  roundRect(ctx, left, chipTop, chipWidth, height, height / 2, false, true);
  ctx.stroke();

  ctx.fillStyle = "#37434F";
  ctx.fillText(primaryText, primaryTextLeft, yCenter);

  ctx.fillStyle = "#758AA1";
  ctx.fillText(secondaryText, secondaryTextLeft, yCenter);
};

export const renderValueCell: CustomRenderer<ValueCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is ValueCell =>
    (cell.data as any).kind === "value-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    const { value } = cell.data.property;

    ctx.fillStyle = theme.textHeader;
    ctx.font = theme.baseFontStyle;

    if (isPlainObject(value)) {
      return drawNestedPropertySummary(args);
    }

    const yCenter = getYCenter(args);

    ctx.fillText(value, rect.x + theme.cellHorizontalPadding, yCenter);
  },
  provideEditor: (cell) => {
    const { value } = cell.data.property;

    /**
     * @todo instead of doing this, set `allowOverlay=false` in the cell data if type is object
     */
    if (isPlainObject(value)) {
      return;
    }

    return {
      styleOverride: { boxShadow: "none" },
      disablePadding: true,
      editor: ValueCellEditor,
    };
  },
};
