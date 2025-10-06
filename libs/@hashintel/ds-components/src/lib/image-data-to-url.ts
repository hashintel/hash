import { createCanvas, type ImageData } from "canvas";

export function imageDataToUrl(
  imageData: ImageData,
  width?: number,
  height?: number,
  x = 0,
  y = 0,
): string {
  const canvas = createCanvas(
    width ?? imageData.width,
    height ?? imageData.height,
  );
  const ctx = canvas.getContext("2d");
  ctx.putImageData(imageData, -x, -y);
  return canvas.toDataURL();
}
