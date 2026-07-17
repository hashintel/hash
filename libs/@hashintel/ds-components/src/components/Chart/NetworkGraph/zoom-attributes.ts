/**
 * Single source of truth for the point size, point opacity, and arrow gap the
 * network graph derives from the current zoom, plus the compact→detail switch, all
 * computed by {@link deriveZoomAttributes}.
 *
 * Thresholds below are absolute orthographic zoom levels (`2 ** zoom` = pixels per
 * world unit), tuned to the graph's framing range: the full reference dataset frames
 * at ≈ −4.3, min zoom ≈ −4.4. Max zoom and the compact→detail threshold are not
 * fixed here — the graph derives them from node spacing and passes the latter in.
 * Denser/sparser data frames at a different zoom, so these may need revisiting if
 * the data's extent changes materially.
 */

const POINT_OPACITY = 1;
// Opacity floor: used both fully zoomed out and, symmetrically, fully zoomed in (as
// the detailed view takes over).
const POINT_MIN_OPACITY = 0.5;
// Fade-in starts from the floor here (most zoomed out).
const OPACITY_FADE_IN_ZOOM = -4.4;
// Points reach full opacity here.
const OPACITY_FULL_ZOOM = -1.5;
// After a stretch at full opacity, fade-out begins here so the crowd recedes behind
// the detailed view.
const OPACITY_FADE_OUT_ZOOM = 1.5;
// Fade-out reaches the floor by here.
const OPACITY_FADE_END_ZOOM = 4.2;

// ── Node sizing ──────────────────────────────────────────────────────────────
// deriveZoomAttributes returns `radiusScale`, a single multiplier for the current
// zoom, applied as deck's `radiusScale` over each layer's base radius + pixel clamps
// — so on zoom only one uniform changes per layer. Base radius, max, multipliers,
// mins, and ring stroke are exported so layers can build those clamps; the
// scale-curve constants stay internal.

/** Base radius (px) of a crowd point, before zoom scaling and clamping. */
export const POINT_RADIUS = 0.1;
/** Maximum on-screen radius (px) of a crowd point, so it never grows too large. */
export const POINT_MAX_RADIUS = 10;
/** Minimum on-screen radius (px) of the hovered/active node, so it stays prominent. */
export const HOVERED_MIN_RADIUS = 8;
/** Minimum on-screen radius (px) of the hovered node's connected neighbours. */
export const NEIGHBOUR_MIN_RADIUS = 5;
/** Width (px) of the white ring around the active/neighbour nodes. */
export const GROW_RING_STROKE = 1.5;
/** Radius of a neighbour's grow ring, relative to a crowd point. */
export const NEIGHBOUR_RADIUS_MULTIPLIER = 1.6;
/** Radius of the active node's grow ring, relative to a crowd point. */
export const HOVERED_RADIUS_MULTIPLIER = 2.2;
/** How much larger than {@link POINT_MAX_RADIUS} the active node's ring may grow. */
export const HOVERED_MAX_MULTIPLIER = 1.5;
// Radius scale vs zoom: shifted exponential `scale = COEFF · RATE^zoom − SHIFT`
// (floored at 0), fit to ≈ zoom −4 → ~0 (crowd at min radius), 0 → ~20, 3 → ~60.
// Grows ~33% per zoom level; the shift makes the crowd bottom out at the min radius
// when zoomed out rather than off a bare exponential.
const RADIUS_SCALE_COEFF = 30;
const RADIUS_SCALE_RATE = 1.33;
const RADIUS_SCALE_SHIFT = 10;

/** Base gap (px) left between a highlighted edge's arrow tip and the node's edge. */
const ARROW_GAP_PX = 6;
// Arrow gap multiplier per zoom level (`gap = ARROW_GAP_PX · rate^zoom`), widening
// the gap as you zoom in.
const ARROW_GAP_ZOOM_RATE = 1.1;

/** Zoom-derived rendering attributes returned by {@link deriveZoomAttributes}. */
export interface ZoomAttributes {
  /**
   * Multiplier applied as deck's `radiusScale` to each node layer's base radius so
   * nodes grow with zoom (shifted exponential, floored at 0). Per-layer pixel clamps
   * then keep each node kind within its size range.
   */
  radiusScale: number;
  /** Base point opacity for the current zoom (see the three-part curve below). */
  pointOpacity: number;
  /**
   * Arrow gap (px), grown slightly as the user zooms in. Shared by the arrow offset
   * and the edge trim so the trimmed edge end stays coincident with the tip.
   */
  arrowGapPx: number;
  /** Whether zoomed in far enough to show detailed nodes (icons + label pills). */
  isDetailZoom: boolean;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const clamp01 = (value: number): number => clamp(value, 0, 1);

const lerp = (from: number, to: number, amount: number): number =>
  from + (to - from) * clamp01(amount);

/**
 * Derive every zoom-dependent rendering attribute from the current `zoom` and the
 * `detailZoom` threshold (the zoom at/above which the detailed view shows). Both are
 * `null` until the view is framed, in which case neutral defaults are returned
 * (smallest node radii, full opacity, base arrow gap, compact view).
 */
export const deriveZoomAttributes = (
  zoom: number | null,
  detailZoom: number | null,
): ZoomAttributes => {
  if (zoom === null) {
    // Unframed: identity scale, so every node layer clamps to its floor radius.
    return {
      radiusScale: 1,
      pointOpacity: POINT_OPACITY,
      arrowGapPx: ARROW_GAP_PX,
      isDetailZoom: false,
    };
  }

  const radiusScale = Math.max(
    0,
    RADIUS_SCALE_COEFF * RADIUS_SCALE_RATE ** zoom - RADIUS_SCALE_SHIFT,
  );

  const arrowGapPx = ARROW_GAP_PX * ARROW_GAP_ZOOM_RATE ** zoom;

  const isDetailZoom = detailZoom !== null && zoom >= detailZoom;

  // Three-part opacity curve: fade in from the floor to full, hold at full, then
  // fade back to the floor so the crowd recedes as the detailed view takes over.
  let pointOpacity: number;
  if (zoom <= OPACITY_FULL_ZOOM) {
    pointOpacity = lerp(
      POINT_MIN_OPACITY,
      POINT_OPACITY,
      (zoom - OPACITY_FADE_IN_ZOOM) /
        (OPACITY_FULL_ZOOM - OPACITY_FADE_IN_ZOOM),
    );
  } else if (zoom <= OPACITY_FADE_OUT_ZOOM) {
    pointOpacity = POINT_OPACITY;
  } else {
    pointOpacity = lerp(
      POINT_OPACITY,
      POINT_MIN_OPACITY,
      (zoom - OPACITY_FADE_OUT_ZOOM) /
        (OPACITY_FADE_END_ZOOM - OPACITY_FADE_OUT_ZOOM),
    );
  }

  return { radiusScale, pointOpacity, arrowGapPx, isDetailZoom };
};
