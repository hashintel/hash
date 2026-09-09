/**
 * Whether a firing is close enough to see to be worth animating.
 *
 * Each transition that fires animates its box, its bolt and every arc it
 * touches, and each of those animations is resolved and painted on the main
 * thread for as long as it runs. On a large net that is hundreds of
 * animations in flight at once, which costs more per frame than everything
 * else the canvas does: on a 1000-node net, dropping them takes a scrub from
 * 13 to 48 frames per second.
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
 * Zoom below which a firing is not animated. A transition's box is around
 * 40px wide, so this is the point where its flash covers ten pixels.
 */
const MIN_ANIMATION_ZOOM = 0.25;

/**
 * Flow units of slack around the pane. Node coordinates are the node's
 * top-left corner and an arc's are its endpoints, so the visible area is
 * widened by roughly a node to cover the rest of the shape.
 */
const VISIBILITY_MARGIN = 200;

const toScreenX = (x: number, { transform }: ViewportState): number =>
  x * transform[2] + transform[0];

const toScreenY = (y: number, { transform }: ViewportState): number =>
  y * transform[2] + transform[1];

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
  const margin = VISIBILITY_MARGIN * viewport.transform[2];
  const left = Math.min(
    toScreenX(firstX, viewport),
    toScreenX(secondX, viewport),
  );
  const right = Math.max(
    toScreenX(firstX, viewport),
    toScreenX(secondX, viewport),
  );
  const top = Math.min(
    toScreenY(firstY, viewport),
    toScreenY(secondY, viewport),
  );
  const bottom = Math.max(
    toScreenY(firstY, viewport),
    toScreenY(secondY, viewport),
  );

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
): boolean =>
  viewport.transform[2] >= MIN_ANIMATION_ZOOM &&
  spanIsVisible(viewport, x, y, x, y);

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
): boolean =>
  viewport.transform[2] >= MIN_ANIMATION_ZOOM &&
  spanIsVisible(viewport, sourceX, sourceY, targetX, targetY);
