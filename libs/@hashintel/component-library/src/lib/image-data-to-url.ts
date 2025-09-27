import { createCanvas, type ImageData } from "canvas";

export function imageDataToUrl(imageData: ImageData): string {
  const canvas = createCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext("2d");
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}
