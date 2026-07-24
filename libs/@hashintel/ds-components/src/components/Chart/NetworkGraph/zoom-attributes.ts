/**
 * Single source of truth for the point size and arrow gap the network graph derives
 * from the current zoom, plus the compact→detail switch, all computed by
 * {@link deriveZoomAttributes}. (Crowd-point *opacity* is not zoom-derived — it comes
 * from the node packing measures; see `packingDivergenceOpacity` in `./node-density`.)
 *
 * Zoom here is *framing-normalised*: `0` is the fully-framed-out view (the graph's
 * min zoom) and each `+1` doubles the on-screen scale from there, whatever the
 * graph's world extent. The graph rebases its absolute orthographic zoom
 * (`2 ** zoom` = pixels per world unit) into this space by subtracting the
 * framing-out zoom before calling {@link deriveZoomAttributes}, so a single set of
 * thresholds frames every dataset alike instead of being pinned to one dataset's
 * world size.
 *
 * The constants below were originally tuned in absolute zoom against the reference
 * dataset, which frames out at ≈ −{@link ZOOM_FRAMING_OFFSET}. Each is rebased by
 * that offset so behaviour is unchanged for that dataset while now generalising to
 * others. Max zoom / the compact→detail threshold aren't fixed here — the graph
 * derives them from the node-spacing↔extent ratio and passes the latter in.
 */

/**
 * The reference dataset's framing-out (min) zoom magnitude, in absolute orthographic
 * levels — i.e. it frames out at ≈ −4.19. The curve constants below were tuned in
 * absolute zoom, so each is shifted by this offset to land at the same visual point
 * on the framing-normalised (0-based) axis {@link deriveZoomAttributes} now works in.
 * Rebasing against a fixed reference keeps the reference dataset pixel-identical
 * while anchoring the curves to each dataset's own framing.
 */
const ZOOM_FRAMING_OFFSET = 4.19;

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
// (floored at 0). Grows ~33% per zoom level; the shift makes the crowd bottom out at
// the min radius when framed out rather than off a bare exponential. On the
// framing-normalised axis this fits ≈ 0 (framed out) → ~0 (crowd at min radius),
// ~4.2 → ~20, ~7.2 → ~60.
const RADIUS_SCALE_RATE = 1.33;
const RADIUS_SCALE_SHIFT = 10;
// Coefficient tuned as 30 in absolute zoom; rebased onto the framing-normalised axis
// (× RATE^−offset ≈ 9.08) so the curve keeps the same value at each absolute zoom.
const RADIUS_SCALE_COEFF = 30 * RADIUS_SCALE_RATE ** -ZOOM_FRAMING_OFFSET;

// Arrow gap multiplier per zoom level (`gap = ARROW_GAP_PX · rate^zoom`), widening
// the gap as you zoom in.
const ARROW_GAP_ZOOM_RATE = 1.1;
/**
 * Gap (px) between a highlighted edge's arrow tip and the node's edge at the
 * framed-out view. Tuned as 6px in absolute zoom; rebased onto the framing-normalised
 * axis (× rate^−offset ≈ 4.02) so the gap matches at each absolute zoom.
 */
const ARROW_GAP_PX = 6 * ARROW_GAP_ZOOM_RATE ** -ZOOM_FRAMING_OFFSET;

/** Zoom-derived rendering attributes returned by {@link deriveZoomAttributes}. */
export interface ZoomAttributes {
  /**
   * Multiplier applied as deck's `radiusScale` to each node layer's base radius so
   * nodes grow with zoom (shifted exponential, floored at 0). Per-layer pixel clamps
   * then keep each node kind within its size range.
   */
  radiusScale: number;
  /**
   * Arrow gap (px), grown slightly as the user zooms in. Shared by the arrow offset
   * and the edge trim so the trimmed edge end stays coincident with the tip.
   */
  arrowGapPx: number;
  /** Whether zoomed in far enough to show detailed nodes (icons + label pills). */
  isDetailZoom: boolean;
}

/**
 * Derive every zoom-dependent rendering attribute from the current `zoom` and the
 * `detailZoom` threshold (the zoom at/above which the detailed view shows). Both are
 * framing-normalised (see the file header): `0` is the framed-out view and the
 * caller rebases the absolute orthographic zoom by subtracting the framing-out zoom
 * before passing it in. Both are `null` until the view is framed, in which case
 * neutral defaults are returned (smallest node radii, base arrow gap, compact view).
 */
export const deriveZoomAttributes = (
  zoom: number | null,
  detailZoom: number | null,
): ZoomAttributes => {
  if (zoom === null) {
    // Unframed: identity scale, so every node layer clamps to its floor radius.
    return {
      radiusScale: 1,
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

  return { radiusScale, arrowGapPx, isDetailZoom };
};
