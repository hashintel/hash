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
 * Flow units of slack around the pane. Node coordinates are the node's
 * top-left corner and an arc's are its endpoints, so the visible area is
 * widened by roughly a node to cover the rest of the shape.
 */
const VISIBILITY_MARGIN = 200;

/**
 * Whether the box spanning two points in flow coordinates overlaps the pane.
 *
 * Points may arrive in either order — an arc runs in any direction — so the
 * span is normalised here rather than at each call site.
 */
const spanIsVisible = (
  viewport: ViewportState,
  firstX: number,
  firstY: number,
  secondX: number,
  secondY: number,
): boolean => {
  const [panX, panY, zoom] = viewport.transform;
  if (zoom < MIN_ANIMATION_ZOOM) {
    return false;
  }
  const margin = VISIBILITY_MARGIN * zoom;
  const left = Math.min(firstX, secondX) * zoom + panX;
  const right = Math.max(firstX, secondX) * zoom + panX;
  const top = Math.min(firstY, secondY) * zoom + panY;
  const bottom = Math.max(firstY, secondY) * zoom + panY;
  return (
    right >= -margin &&
    bottom >= -margin &&
    left <= viewport.width + margin &&
    top <= viewport.height + margin
  );
};

/**
 * Whether a node at this flow position should play its firing animation.
 */
export const nodeFiringIsVisible = (
  viewport: ViewportState,
  x: number,
  y: number,
): boolean => spanIsVisible(viewport, x, y, x, y);

/**
 * Whether an arc between these two flow positions should play its firing
 * animation. The arc is drawn as a curve, so the box between its endpoints
 * understates it; the margin covers the bulge.
 */
export const arcFiringIsVisible = (
  viewport: ViewportState,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): boolean => spanIsVisible(viewport, sourceX, sourceY, targetX, targetY);
