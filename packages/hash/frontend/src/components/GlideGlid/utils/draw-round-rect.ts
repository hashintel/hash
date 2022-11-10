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
) => {
  // restrict radius to a reasonable max
  const _radius = Math.min(radius, height / 2, width / 2);

  ctx.moveTo(x + _radius, y);
  ctx.arcTo(x + width, y, x + width, y + _radius, _radius);
  ctx.arcTo(x + width, y + height, x + width - _radius, y + height, _radius);
  ctx.arcTo(x, y + height, x, y + height - _radius, _radius);
  ctx.arcTo(x, y, x + _radius, y, _radius);
};
