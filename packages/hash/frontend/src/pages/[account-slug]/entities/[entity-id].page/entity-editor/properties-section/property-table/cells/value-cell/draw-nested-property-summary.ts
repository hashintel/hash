import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";
import { getYCenter } from "../../../../../../../../../components/GlideGlid/utils";
import { drawRoundRect } from "../../../../../../../../../components/GlideGlid/utils/draw-round-rect";
import { getPropertyCountSummary } from "../../../get-property-count-summary";
import { ValueCell } from "./types";

export const drawNestedPropertySummary = (args: DrawArgs<ValueCell>) => {
  const { ctx, rect, cell } = args;
  const yCenter = getYCenter(args);

  const { emptyCount, notEmptyCount } = getPropertyCountSummary(
    cell.data.property.value,
  );

  const secondaryTextComponents: string[] = [];
  if (notEmptyCount) {
    const valueWord = notEmptyCount === 1 ? "value" : "values";
    secondaryTextComponents.push(`${notEmptyCount} ${valueWord}`);
  }
  if (emptyCount) {
    secondaryTextComponents.push(`${emptyCount} empty`);
  }

  const primaryText = `${emptyCount + notEmptyCount} total`;
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
  drawRoundRect(ctx, left, chipTop, chipWidth, height, height / 2, false, true);
  ctx.stroke();

  ctx.fillStyle = "#37434F";
  ctx.fillText(primaryText, primaryTextLeft, yCenter);

  ctx.fillStyle = "#758AA1";
  ctx.fillText(secondaryText, secondaryTextLeft, yCenter);
};
