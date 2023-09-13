import { CustomCell } from "@glideapps/glide-data-grid";
import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";
import type { CustomIcon } from "@glideapps/glide-data-grid/dist/ts/data-grid/data-grid-sprites";

import { getYCenter } from "../utils";
import { drawChip } from "./draw-chip";

const drawClippedImage = ({
  ctx,
  height: proposedHeight,
  image,
  left,
  top: proposedTop,
  maxWidth,
}: {
  ctx: CanvasRenderingContext2D;
  image: HTMLImageElement;
  top: number;
  left: number;
  height: number;
  maxWidth: number;
}) => {
  // Save the context so we can restore it after clipping the image with the rounded rect we're about to draw
  ctx.save();

  const proposedWidth =
    (image.naturalWidth / image.naturalHeight) * proposedHeight;

  const width = Math.min(proposedWidth, maxWidth);
  const height = (image.naturalHeight / image.naturalWidth) * width;
  const top = proposedTop + (proposedHeight - height) / 2;

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
 * @param textColor text color
 * @param bgColor background color
 * @returns width of the drawn chip
 */
export const drawChipWithIcon = ({
  args,
  text,
  icon = "bpAsterisk",
  imageSrc,
  left,
  textColor,
  borderColor,
}: {
  args: DrawArgs<CustomCell>;
  text: string;
  icon?: CustomIcon;
  imageSrc?: string;
  left: number;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
}) => {
  const { ctx, theme } = args;
  const yCenter = getYCenter(args);

  const paddingX = 12;
  const iconHeight = imageSrc ? 24 : 10;
  const gap = 8;

  const iconLeft = left + paddingX;

  ctx.font = args.theme.baseFontStyle;
  const textWidth = ctx.measureText(text).width;
  let chipWidth = iconHeight + gap + textWidth + 2 * paddingX;

  const textColorInner = textColor ?? theme.textBubble;

  const iconTop = yCenter - iconHeight / 2;

  if (imageSrc) {
    // We'll only want to load the image once
    let imgElement: HTMLImageElement | null = document.querySelector(
      `[src='${imageSrc}']`,
    );

    if (!imgElement) {
      imgElement = new Image();
      imgElement.src = imageSrc;
      imgElement.style.display = "none";
      document.body.appendChild(imgElement);
    }

    const maxWidth = 80;

    if (imgElement.complete) {
      const imageWidth = drawClippedImage({
        ctx,
        image: imgElement,
        left: iconLeft,
        top: iconTop,
        height: iconHeight,
        maxWidth,
      });

      chipWidth = imageWidth + gap + textWidth + 2 * paddingX;
    } else {
      imgElement.addEventListener("load", () => {
        const imageWidth = drawClippedImage({
          ctx,
          image: imgElement!,
          left: iconLeft,
          top: iconTop,
          height: iconHeight,
          maxWidth,
        });

        chipWidth = imageWidth + gap + textWidth + 2 * paddingX;
      });
    }
  } else {
    args.spriteManager.drawSprite(
      icon,
      "normal",
      ctx,
      iconLeft,
      iconTop,
      iconHeight,
      { ...theme, fgIconHeader: textColorInner },
    );
  }

  drawChip(args, left, chipWidth, "transparent", borderColor ?? "white");

  const textLeft = left + chipWidth - paddingX - textWidth;

  ctx.fillStyle = textColorInner;
  ctx.fillText(text, textLeft, yCenter);

  return chipWidth;
};
