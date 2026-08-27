export type Size = { width: number; height: number };

export type Rect = { x: number; y: number; width: number; height: number };

type CenteredBox = {
  position: { x: number; y: number };
  width?: number;
  height?: number;
};

/**
 * Bounding box of boxes positioned by their center point (the SDCPN
 * convention for node positions). Boxes with unknown size count as points.
 * Returns null when there are no boxes.
 */
export const getBoundsOfCenteredBoxes = (
  boxes: readonly CenteredBox[],
): Rect | null => {
  if (boxes.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const box of boxes) {
    const halfWidth = (box.width ?? 0) / 2;
    const halfHeight = (box.height ?? 0) / 2;
    minX = Math.min(minX, box.position.x - halfWidth);
    minY = Math.min(minY, box.position.y - halfHeight);
    maxX = Math.max(maxX, box.position.x + halfWidth);
    maxY = Math.max(maxY, box.position.y + halfHeight);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

/**
 * Padding factor shared by the canvas fit and zoom limits: an initial fit
 * leaves this much viewport around the net, and at minimum zoom the net
 * occupies this fraction of the viewport's limiting axis.
 */
export const ZOOM_PADDING = 0.4;

/** Zoom floor while the net is empty or has no area to fit. */
const EMPTY_BOUNDS_MIN_ZOOM = 0.5;

/** Even a tiny net must allow zooming out a reasonable amount. */
const MIN_ZOOM_CEILING = 0.75;

/**
 * The lowest zoom the user may reach for the given net bounds: the zoom at
 * which the net occupies {@link ZOOM_PADDING} of the viewport's limiting
 * axis, capped at {@link MIN_ZOOM_CEILING}.
 */
export const getMinZoomForBounds = (
  bounds: Rect | null,
  viewport: Size,
): number => {
  const zoomShowingWholeNet =
    bounds && bounds.width > 0 && bounds.height > 0
      ? Math.min(
          viewport.width / bounds.width,
          viewport.height / bounds.height,
        ) * ZOOM_PADDING
      : EMPTY_BOUNDS_MIN_ZOOM;

  return Math.min(zoomShowingWholeNet, MIN_ZOOM_CEILING);
};
