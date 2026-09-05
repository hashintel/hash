/**
 * Viewport math for the net diagram: an overview+detail camera over the
 * laid-out graph. The viewport maps layout coordinates to pane pixels as
 * `pane = layout * scale + (x, y)`.
 */

export type Viewport = { x: number; y: number; scale: number };

export type Size = { width: number; height: number };

export const MIN_SCALE = 0.15;
export const MAX_SCALE = 2.5;

const clampScale = (scale: number): number =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/**
 * The camera that shows the whole layout centred in the pane, zoomed in no
 * further than 1:1 so small nets don't blow up to fill the space.
 */
export function fitViewport(content: Size, pane: Size, margin = 16): Viewport {
  const scale = clampScale(
    Math.min(
      1,
      (pane.width - margin * 2) / Math.max(content.width, 1),
      (pane.height - margin * 2) / Math.max(content.height, 1),
    ),
  );
  return {
    scale,
    x: (pane.width - content.width * scale) / 2,
    y: (pane.height - content.height * scale) / 2,
  };
}

/** Zoom by a wheel delta towards a fixed point, in pane coordinates. */
export function zoomViewport(
  viewport: Viewport,
  panePoint: { x: number; y: number },
  deltaY: number,
): Viewport {
  const scale = clampScale(viewport.scale * Math.exp(-deltaY * 0.0022));
  // The layout point under the cursor stays under the cursor.
  const ratio = scale / viewport.scale;
  return {
    scale,
    x: panePoint.x - (panePoint.x - viewport.x) * ratio,
    y: panePoint.y - (panePoint.y - viewport.y) * ratio,
  };
}

export function panViewport(
  viewport: Viewport,
  dx: number,
  dy: number,
): Viewport {
  return { ...viewport, x: viewport.x + dx, y: viewport.y + dy };
}

/** The pane's visible region, in layout coordinates — the minimap's window. */
export function visibleRegion(
  viewport: Viewport,
  pane: Size,
): { x: number; y: number; width: number; height: number } {
  return {
    x: -viewport.x / viewport.scale,
    y: -viewport.y / viewport.scale,
    width: pane.width / viewport.scale,
    height: pane.height / viewport.scale,
  };
}

/** Re-centre the camera on a layout point, keeping the current zoom. */
export function centerViewportOn(
  viewport: Viewport,
  layoutPoint: { x: number; y: number },
  pane: Size,
): Viewport {
  return {
    ...viewport,
    x: pane.width / 2 - layoutPoint.x * viewport.scale,
    y: pane.height / 2 - layoutPoint.y * viewport.scale,
  };
}
