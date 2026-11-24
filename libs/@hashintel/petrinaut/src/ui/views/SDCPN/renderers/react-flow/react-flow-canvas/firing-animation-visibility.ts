/**
 * Whether a firing is close enough to see to be worth animating.
 *
 * Each transition that fires animates its box, its bolt and every arc it
 * touches, and each animation is resolved and painted on the main thread for
 * as long as it runs, so on a large net hundreds run at once.
 *
 * Most of that work is invisible. A node off the side of the pane cannot be
 * seen at all, and one drawn at a twentieth of its size is a smudge a few
 * pixels across. Both are skipped, so the animations that survive are the
 * ones somebody is looking at.
 */

/** React Flow's `[panX, panY, zoom]`, with the pane's size in pixels. */
export type ViewportState = {
  transform: [number, number, number];
  width: number;
  height: number;
};

/**
 * Zoom below which a firing is not animated. Below it a compact transition
 * is under 45px across, and its flash reads as a flicker rather than a firing.
 */
const MIN_ANIMATION_ZOOM = 0.25;

/**
 * Flow units of slack around the pane. A node's coordinates are its top-left
 * corner, so the visible area is widened by roughly a node to cover the rest
 * of the shape.
 */
const VISIBILITY_MARGIN = 200;

/**
 * Whether a firing drawn within this box, in flow units, should be animated.
 * A node gives its position alone.
 */
export const firingIsVisible = (
  viewport: ViewportState,
  {
    x,
    y,
    width = 0,
    height = 0,
  }: { x: number; y: number; width?: number; height?: number },
): boolean => {
  const [panX, panY, zoom] = viewport.transform;
  if (zoom < MIN_ANIMATION_ZOOM) {
    return false;
  }
  const margin = VISIBILITY_MARGIN * zoom;
  return (
    (x + width) * zoom + panX >= -margin &&
    (y + height) * zoom + panY >= -margin &&
    x * zoom + panX <= viewport.width + margin &&
    y * zoom + panY <= viewport.height + margin
  );
};
