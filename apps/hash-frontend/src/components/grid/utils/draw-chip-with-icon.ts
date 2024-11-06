import type { CustomCell, DrawArgs } from "@glideapps/glide-data-grid";

import type {
  ChipCellColor,
  ChipCellVariant,
} from "../../../pages/shared/chip-cell";
import { getChipColors } from "../../../pages/shared/chip-cell";
import { getYCenter } from "../utils";
import type { CustomIcon } from "./custom-grid-icons";
import { drawChip } from "./draw-chip";

const filledIconCanvasCache: {
  [originalUrl: string]: {
    [fillColor: string]: HTMLCanvasElement;
  };
} = {};

/**
 * In order to fill SVGs with a new color, we draw them on an off-screen canvas,
 * and fill the non-transparent parts of the image with the desired color.
 */
const getFilledCanvas = ({
  fill,
  iconUrl,
  image,
}: {
  fill: string;
  iconUrl: string;
  image: HTMLImageElement | ImageBitmap;
}): HTMLImageElement | ImageBitmap | HTMLCanvasElement => {
  if (!iconUrl.endsWith(".svg")) {
    return image;
  }

  const cachedCanvas = filledIconCanvasCache[iconUrl]?.[fill];

  if (cachedCanvas) {
    return cachedCanvas;
  }

  const offScreenCanvas = document.createElement("canvas");
  const offScreenContext = offScreenCanvas.getContext("2d");

  if (!offScreenContext) {
    throw new Error("Could not create off-screen canvas");
  }

  offScreenCanvas.width = image.width;
  offScreenCanvas.height = image.height;

  // Draw the image onto the off-screen canvas
  offScreenContext.drawImage(image, 0, 0);

  offScreenContext.globalCompositeOperation = "source-in";
  offScreenContext.fillStyle = fill;
  offScreenContext.fillRect(
    0,
    0,
    offScreenCanvas.width,
    offScreenCanvas.height,
  );

  filledIconCanvasCache[iconUrl] ??= {};
  filledIconCanvasCache[iconUrl][fill] = offScreenCanvas;

  return offScreenCanvas;
};

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

export type DrawChipWithIconProps = {
  args: DrawArgs<CustomCell>;
  icon?:
    | {
        inbuiltIcon: CustomIcon;
      }
    | { imageSrc: string }
    | { entityTypeIcon: string };
  iconFill?: string;
  text: string;
  left: number;
  color: ChipCellColor;
  variant?: ChipCellVariant;
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
  icon,
  iconFill,
  text,
  left,
  color,
  variant,
}: DrawChipWithIconProps) => {
  const { ctx, theme, imageLoader, col, row } = args;
  const yCenter = getYCenter(args);

  const paddingX = 12;
  const iconHeight = icon && "imageSrc" in icon ? 24 : 12;
  const gap = 8;

  const iconLeft = left + paddingX;

  ctx.font = args.theme.baseFontStyle;
  const textWidth = ctx.measureText(text).width;

  const iconTop = yCenter - iconHeight / 2;

  const {
    bgColor,
    borderColor,
    iconColor: defaultColor,
    textColor,
  } = getChipColors(color, variant);

  const iconColor = iconFill ?? defaultColor;

  let chipWidth = iconHeight + gap + textWidth + 2 * paddingX;

  let chipHeight;
  let chipTop;

  if (icon && "imageSrc" in icon) {
    const image = imageLoader.loadOrGetImage(icon.imageSrc, col, row);

    if (image) {
      const maxWidth = 80;

      const proposedWidth = (image.width / image.height) * iconHeight;

      const width = Math.min(proposedWidth, maxWidth);
      const imageHeight = (image.height / image.width) * width;
      const imageTop = iconTop + (iconHeight - imageHeight) / 2;

      chipWidth = width + gap + textWidth + 2 * paddingX;

      ({ height: chipHeight, top: chipTop } = drawChip(
        args,
        left,
        chipWidth,
        bgColor,
        borderColor,
      ));

      drawClippedImage({
        ctx,
        image,
        left: iconLeft,
        top: imageTop,
        height: imageHeight,
        width,
      });
    } else {
      throw new Error(`Image not loaded: ${icon.imageSrc}`);
    }
  } else {
    ({ height: chipHeight, top: chipTop } = drawChip(
      args,
      left,
      chipWidth,
      bgColor,
      borderColor,
    ));

    if (icon && "inbuiltIcon" in icon) {
      args.spriteManager.drawSprite(
        icon.inbuiltIcon,
        "normal",
        ctx,
        iconLeft,
        iconTop,
        iconHeight,
        { ...theme, fgIconHeader: iconColor },
      );
    } else if (icon && "entityTypeIcon" in icon) {
      if (icon.entityTypeIcon.match(/\p{Extended_Pictographic}$/u)) {
        /**
         * This is an emoji icon
         */
        ctx.fillStyle = iconColor;
        const currentFont = ctx.font;
        ctx.font = `bold ${iconHeight}px Inter`;
        ctx.fillText(icon.entityTypeIcon, iconLeft, yCenter);
        ctx.font = currentFont;
      } else {
        let iconUrl;
        if (icon.entityTypeIcon.startsWith("/")) {
          iconUrl = new URL(icon.entityTypeIcon, window.location.origin).href;
        } else if (icon.entityTypeIcon.startsWith("https")) {
          iconUrl = icon.entityTypeIcon;
        }

        if (iconUrl) {
          const image = imageLoader.loadOrGetImage(iconUrl, col, row);

          if (image) {
            const canvasWithFill = getFilledCanvas({
              fill: iconColor,
              iconUrl,
              image,
            });

            const aspectRatio = image.width / image.height;

            const width =
              aspectRatio > 1 ? iconHeight : iconHeight * aspectRatio;
            const height =
              aspectRatio > 1 ? iconHeight / aspectRatio : iconHeight;

            ctx.drawImage(
              canvasWithFill,
              iconLeft + (iconHeight - width) / 2,
              iconTop + (iconHeight - height) / 2,
              width,
              height,
            );
          }
        }
      }
    }
  }

  const textLeft = left + chipWidth - paddingX - textWidth;

  ctx.fillStyle = textColor;
  ctx.fillText(text, textLeft, yCenter);

  return {
    height: chipHeight,
    width: chipWidth,
    top: chipTop,
  };
};
