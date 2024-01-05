import { CustomCell } from "@glideapps/glide-data-grid";
import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";
import type { CustomIcon } from "@glideapps/glide-data-grid/dist/ts/data-grid/data-grid-sprites";

import {
  ChipCellColor,
  ChipCellVariant,
  getChipColors,
} from "../../../pages/shared/chip-cell";
import { getYCenter } from "../utils";
import { drawChip } from "./draw-chip";

const drawClippedImage = ({
  ctx,
  height,
  image,
  left,
  top,
  width,
}: {
  ctx: CanvasRenderingContext2D;
  image: HTMLImageElement | ImageBitmap;
  top: number;
  left: number;
  height: number;
  width: number;
}) => {
  // Save the context so we can restore it after clipping the image with the rounded rect we're about to draw
  ctx.save();

  const topRightCorner = [left + width, top] as const;
  const bottomRightCorner = [left + width, top + height] as const;
  const bottomLeftCorner = [left, top + height] as const;
  const topLeftCorner = [left, top] as const;

  const borderRadius = 4;

  ctx.beginPath();
  ctx.moveTo(...topLeftCorner);
  ctx.lineTo(topRightCorner[0] - borderRadius, topRightCorner[1]);
  ctx.quadraticCurveTo(
    ...topRightCorner,
    topRightCorner[0],
    topRightCorner[1] + borderRadius,
  );
  ctx.lineTo(bottomRightCorner[0], bottomRightCorner[1] - borderRadius);
  ctx.quadraticCurveTo(
    ...bottomRightCorner,
    bottomRightCorner[0] - borderRadius,
    bottomRightCorner[1],
  );
  ctx.lineTo(bottomLeftCorner[0] + borderRadius, bottomLeftCorner[1]);
  ctx.quadraticCurveTo(
    ...bottomLeftCorner,
    bottomLeftCorner[0],
    bottomLeftCorner[1] - borderRadius,
  );
  ctx.lineTo(topLeftCorner[0], topLeftCorner[1] + borderRadius);
  ctx.quadraticCurveTo(
    ...topLeftCorner,
    topLeftCorner[0] + borderRadius,
    topLeftCorner[1],
  );
  ctx.closePath();
  ctx.clip();

  ctx.drawImage(image, left, top, width, height);

  // Restore the saved context so that the clipping path won't affect anything else
  ctx.restore();

  return width;
};

/**
 * @param args draw args of cell
 * @param text text content of chip
 * @param left left position of chip
 * @param color the chip color
 * @param [variant] the chip variant
 * @param [icon] the icon to draw
 * @param [imageSrc] the image to draw
 *
 * @returns width of the drawn chip
 */
export const drawChipWithIcon = ({
  args,
  text,
  icon = "bpAsterisk",
  imageSrc,
  left,
  color,
  variant,
}: {
  args: DrawArgs<CustomCell>;
  text: string;
  icon?: CustomIcon;
  imageSrc?: string;
  left: number;
  color: ChipCellColor;
  variant?: ChipCellVariant;
}) => {
  const { ctx, theme, imageLoader, col, row } = args;
  const yCenter = getYCenter(args);

  const paddingX = 12;
  const iconHeight = imageSrc ? 24 : 12;
  const gap = 8;

  const iconLeft = left + paddingX;

  ctx.font = args.theme.baseFontStyle;
  const textWidth = ctx.measureText(text).width;

  const iconTop = yCenter - iconHeight / 2;

  const { bgColor, borderColor, iconColor, textColor } = getChipColors(
    color,
    variant,
  );

  let chipWidth = iconHeight + gap + textWidth + 2 * paddingX;

  if (imageSrc) {
    const image = imageLoader.loadOrGetImage(imageSrc, col, row);

    if (image) {
      const maxWidth = 80;

      const proposedWidth = (image.width / image.height) * iconHeight;

      const width = Math.min(proposedWidth, maxWidth);
      const height = (image.height / image.width) * width;
      const top = iconTop + (iconHeight - height) / 2;

      chipWidth = width + gap + textWidth + 2 * paddingX;

      drawChip(args, left, chipWidth, bgColor, borderColor);
      drawClippedImage({
        ctx,
        image,
        left: iconLeft,
        top,
        height,
        width,
      });
    }
  } else {
    drawChip(args, left, chipWidth, bgColor, borderColor);
    args.spriteManager.drawSprite(
      icon,
      "normal",
      ctx,
      iconLeft,
      iconTop,
      iconHeight,
      { ...theme, fgIconHeader: iconColor },
    );
  }

  const textLeft = left + chipWidth - paddingX - textWidth;

  ctx.fillStyle = textColor;
  ctx.fillText(text, textLeft, yCenter);

  return chipWidth;
};
