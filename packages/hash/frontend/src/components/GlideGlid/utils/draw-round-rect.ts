/**
 * @todo remove this function and use ctx.roundRect when firefox supports it
 * @see https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/roundRect#browser_compatibility
 */
export const drawRoundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 5,
  fill = false,
  stroke = true,
) => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) {
    ctx.fill();
  }
  if (stroke) {
    ctx.stroke();
  }
};
