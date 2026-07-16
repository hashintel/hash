/**
 * The single source of truth for everything the network graph derives from the
 * current zoom level. Point size, point opacity, the arrow gap, and the
 * compact→detail switch are all computed together by {@link deriveZoomAttributes}
 * from the current zoom alone — so the way each knob responds to zoom (and the
 * relationships between them) lives in one place.
 *
 * All thresholds below are absolute orthographic zoom levels (`2 ** zoom` = pixels
 * per world unit), not offsets from any framing — so they are tuned to the zoom
 * range the graph actually operates in. That range depends on the data's spatial
 * extent: the full reference dataset frames at ≈ −4.3 and allows zooming in to
 * ≈ 4.7 (its `minZoom`…`maxZoom` is ≈ [−4.4, 4.7]), which is what these are tuned
 * for. Denser/sparser data (or a smaller subset) frames at a different zoom, so
 * these may need revisiting if the data's extent changes materially.
 */

/** Base opacity of the points — subtly transparent so dense areas read as depth. */
const POINT_OPACITY = 1;
/**
 * Point opacity floor — used both when zoomed all the way out and, symmetrically,
 * when zoomed all the way in (as the detailed view takes over).
 */
const POINT_MIN_OPACITY = 0.5;
/** Zoom at which the opacity fade-in starts from the floor (most zoomed out). */
const OPACITY_FADE_IN_ZOOM = -4.4;
/** Zoom at which points reach full opacity while zooming in. */
const OPACITY_FULL_ZOOM = -1.5;
/**
 * Zoom at which points — after a stretch at full opacity — begin fading back out
 * as you keep zooming in, so the crowd recedes behind the detailed view.
 */
const OPACITY_FADE_OUT_ZOOM = 1.5;
/** Zoom by which the fade-out has returned points to the opacity floor. */
const OPACITY_FADE_END_ZOOM = 4.2;
/**
 * Zoom at/above which the node layer switches from the compact points to the
 * detailed nodes — larger nodes showing their icon and label pill. Just below the
 * reference dataset's max zoom (≈ 4.7) so the final zoom-in reveals it.
 */
const DETAIL_ZOOM = 4.2;

// ── Node sizing ──────────────────────────────────────────────────────────────
// deriveZoomAttributes returns `radiusScale`, a single multiplier for the current
// zoom. Each node layer applies it as deck's `radiusScale` on top of its own base
// radius (`POINT_RADIUS · multiplier`) and pixel min/max clamps — so on zoom only
// one uniform changes per layer, instead of re-deriving a radius for every point.
// The base radius, max, multipliers, mins, and ring stroke are exported for the
// layers to build those clamps; the scale-curve constants stay internal.

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
// The radius scale as a function of zoom, a shifted exponential
// `scale = COEFF · RATE^zoom − SHIFT` (floored at 0), fit to approximately:
//   zoom −4 → ~0 (crowd at its min radius),  zoom 0 → ~20,  zoom 3 → ~60.
// It grows ~33% per zoom level, shifted down so the crowd bottoms out at the min
// radius when zoomed out rather than growing off a bare exponential. Returned as
// `radiusScale`; these curve constants stay internal.
const RADIUS_SCALE_COEFF = 30;
const RADIUS_SCALE_RATE = 1.33;
const RADIUS_SCALE_SHIFT = 10;

/** Base gap (px) left between a highlighted edge's arrow tip and the node's edge. */
const ARROW_GAP_PX = 6;
/**
 * How the arrow gap grows with zoom: the base gap is multiplied by this per zoom
 * level (`gap = ARROW_GAP_PX · rate^zoom`), so the gap widens as you zoom in.
 */
const ARROW_GAP_ZOOM_RATE = 1.1;

/**
 * The zoom-derived rendering attributes returned by {@link deriveZoomAttributes}.
 */
export interface ZoomAttributes {
  /**
   * Multiplier applied (as deck's `radiusScale`) to each node layer's base radius
   * so nodes grow with zoom — a shifted exponential, floored at 0. The per-layer
   * pixel min/max clamps then keep each node kind within its size range.
   */
  radiusScale: number;
  /** Base point opacity for the current zoom (see the three-part curve below). */
  pointOpacity: number;
  /**
   * The arrow gap (px), grown slightly as the user zooms in. Shared by the arrow
   * offset and the edge trim so the trimmed edge end stays coincident with the tip.
   */
  arrowGapPx: number;
  /**
   * Whether the view is zoomed in far enough to show the detailed node variation
   * (larger nodes with icons + label pills) instead of plain points.
   */
  isDetailZoom: boolean;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const clamp01 = (value: number): number => clamp(value, 0, 1);

const lerp = (from: number, to: number, amount: number): number =>
  from + (to - from) * clamp01(amount);

/**
 * Derive every zoom-dependent rendering attribute from the current `zoom` alone.
 * `zoom` is `null` until the view has been framed, in which case neutral defaults
 * are returned (the smallest node radii, full opacity, the base arrow gap, and the
 * compact view).
 */
export const deriveZoomAttributes = (zoom: number | null): ZoomAttributes => {
  if (zoom === null) {
    // Unframed: identity scale, so every node layer clamps to its floor radius.
    return {
      radiusScale: 1,
      pointOpacity: POINT_OPACITY,
      arrowGapPx: ARROW_GAP_PX,
      isDetailZoom: false,
    };
  }

  // Radius scale for this zoom: a shifted exponential, floored at 0. Applied as
  // deck's `radiusScale` on each node layer (over its base radius + pixel clamps).
  const radiusScale = Math.max(
    0,
    RADIUS_SCALE_COEFF * RADIUS_SCALE_RATE ** zoom - RADIUS_SCALE_SHIFT,
  );

  // Arrow gap widens as you zoom in.
  const arrowGapPx = ARROW_GAP_PX * ARROW_GAP_ZOOM_RATE ** zoom;

  // Compact→detail switch near the top of the zoom range.
  const isDetailZoom = zoom >= DETAIL_ZOOM;

  // Opacity as a three-part curve:
  //   1. fade in from POINT_MIN_OPACITY (zoomed out) to full by OPACITY_FULL_ZOOM,
  //   2. hold at full opacity through OPACITY_FADE_OUT_ZOOM, then
  //   3. fade back to POINT_MIN_OPACITY by OPACITY_FADE_END_ZOOM, so the crowd
  //      recedes as the detailed view takes over.
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
