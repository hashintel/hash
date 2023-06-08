import { CustomCell } from "@glideapps/glide-data-grid";
import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";
import type { CustomIcon } from "@glideapps/glide-data-grid/dist/ts/data-grid/data-grid-sprites";

import { getYCenter } from "../utils";

interface DrawTextWithIconParams {
  args: DrawArgs<CustomCell>;
  text: string;
  icon: CustomIcon;
  left: number;
  iconSize?: number;
  textColor?: string;
  iconColor?: string;
  gap?: number;
}

export const drawTextWithIcon = ({
  args,
  text,
  icon,
  left,
  iconSize = 10,
  gap = 6,
  textColor,
  iconColor,
}: DrawTextWithIconParams) => {
  const { ctx, theme } = args;
  const yCenter = getYCenter(args);

  const iconLeft = left;
  const textLeft = iconSize + gap + iconLeft;

  const fgIconHeader = iconColor ?? theme.textHeader;
  args.spriteManager.drawSprite(
    icon,
    "normal",
    ctx,
    iconLeft,
    yCenter - iconSize / 2,
    iconSize,
    { ...theme, fgIconHeader },
  );

  ctx.fillStyle = textColor ?? theme.textHeader;
  ctx.fillText(text, textLeft, yCenter);
};
