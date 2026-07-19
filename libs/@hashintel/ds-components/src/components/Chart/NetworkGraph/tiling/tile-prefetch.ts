/**
 * Speculative prefetch for the Atlas tiling layer: given the recent viewport
 * history, decide which tiles to pull ahead of need.
 *
 * Measurements (see the prefetch harness / browser telemetry) showed the old
 * purely-directional predictor only paid off during *sustained* straight pans —
 * it needed two consistent steps to lock on, so real interaction (which switches
 * pan→zoom→turn every step or two) got almost no benefit. This module addresses
 * that:
 *
 *  - **Ring, not just direction.** Every navigating step prefetches the one-tile
 *    border around the current viewport, so a pan in *any* direction (including a
 *    reversal) is already covered — no lock-on latency.
 *  - **Directional bias.** When the move is a continuous drag/scroll the
 *    predicted-next-viewport tiles are added and ranked first, so the travel
 *    direction still gets priority within the budget.
 *  - **Smoothed velocity.** The pan/zoom velocity is averaged over the retained
 *    history rather than read off the last two viewports, so a single noisy step
 *    does not derail the prediction.
 *  - **Zoom that resizes.** A predicted zoom shrinks (zoom-in) or grows
 *    (zoom-out) the predicted rectangle instead of keeping the current size, and
 *    reads the *continuous* zoom velocity from the rectangle ratio rather than
 *    the jittery rounded depth.
 *  - **Jump suppression.** A single-step move larger than a few viewports is a
 *    teleport (initial framing, jump-to), not a drag; its garbage extrapolation
 *    is dropped (the ring still fires).
 *  - **Budget that covers the ring.** The per-step cap scales toward the ring
 *    size (tapered by cache fullness) so a fast pan is not starved at six tiles.
 */

import {
  atlasTileKey,
  ATLAS_TILE_MAX_ZOOM,
  type AtlasTileCoordinate,
} from "./atlas-tile-coordinate";
import {
  clampInt,
  clampRectToWorld,
  rectCenterX,
  rectCenterY,
  rectHeight,
  rectWidth,
  requiredTiles,
  tileDistance,
  WORLD_SIZE,
  type ViewportRegion,
} from "./tile-geometry";

/** How many recent viewports to retain for movement prediction. */
export const HISTORY_LENGTH = 5;

/** Upper bound on tiles speculatively prefetched per step (before the taper). */
const PREFETCH_MAX = 16;

/**
 * Above this cache fullness, prefetching stops entirely; below it the budget
 * tapers with fullness so a busy cache prefetches less aggressively.
 */
const PREFETCH_FULLNESS_CEILING = 0.85;

/**
 * Minimum smoothed pan, as a fraction of the viewport's smaller side, before a
 * movement is treated as intentional (rather than jitter) and triggers a
 * prefetch. Dwelling on a spot prefetches nothing.
 */
const MIN_PAN_FRACTION = 0.15;

/** Minimum smoothed zoom velocity (in quadtree levels/step) to count as a zoom. */
const MIN_ZOOM_LEVELS = 0.2;

/**
 * A single-step pan larger than this many viewport widths is a discontinuity
 * (initial framing, jump-to) rather than a drag, so its direction is not
 * extrapolated.
 */
const JUMP_FRACTION = 3;

/** How many recent steps the pan/zoom velocity is averaged over. */
const SMOOTH_WINDOW = 3;

/** Bounds a single predicted zoom step to at most one level either way. */
const MAX_DEPTH_STEP = 1;

/** The slice of {@link TileCache} the prefetch scheduler reads and drives. */
export interface PrefetchCache {
  /** Fraction of the byte budget in use, in `[0, 1]`. */
  readonly fullness: number;
  /** Recent viewports, oldest first; the last is the current viewport. */
  readonly history: readonly ViewportRegion[];
  /** Whether a tile is already resident. */
  has(coordinate: AtlasTileCoordinate): boolean;
  /**
   * Issues this batch of speculative loads and cancels any still-in-flight
   * prefetch no longer in the batch (superseded speculation).
   */
  prefetchBatch(coordinates: readonly AtlasTileCoordinate[]): void;
}

/** Tiles to prefetch given cache fullness: 0 when near full, tapering below. */
export const prefetchBudget = (fullness: number): number => {
  if (fullness >= PREFETCH_FULLNESS_CEILING) {
    return 0;
  }
  return Math.max(0, Math.ceil(PREFETCH_MAX * (1 - fullness)));
};

interface Movement {
  /** Smoothed per-step centre delta. */
  readonly panX: number;
  readonly panY: number;
  /** Smoothed zoom velocity in quadtree levels/step (`+` = zooming in). */
  readonly depthDelta: number;
  /** Magnitude of the single most recent pan (for jump detection). */
  readonly lastPanDistance: number;
  /** The current viewport's smaller side, the scale for the thresholds. */
  readonly currentSide: number;
}

/**
 * The smoothed pan/zoom velocity over the last {@link SMOOTH_WINDOW} steps, plus
 * the single most recent pan magnitude. `null` with too little history.
 */
const smoothedMovement = (
  history: readonly ViewportRegion[],
): Movement | null => {
  if (history.length < 2) {
    return null;
  }
  const current = history[history.length - 1];
  const previous = history[history.length - 2];
  if (!current || !previous) {
    return null;
  }

  const pairs = Math.min(SMOOTH_WINDOW, history.length - 1);
  let sumX = 0;
  let sumY = 0;
  let sumDepth = 0;
  for (let index = 0; index < pairs; index += 1) {
    const newer = history[history.length - 1 - index];
    const older = history[history.length - 2 - index];
    if (!newer || !older) {
      break;
    }
    sumX += rectCenterX(newer.rect) - rectCenterX(older.rect);
    sumY += rectCenterY(newer.rect) - rectCenterY(older.rect);
    const newerWidth = rectWidth(newer.rect);
    const olderWidth = rectWidth(older.rect);
    if (newerWidth > 0 && olderWidth > 0) {
      // log2(shrinking) > 0, i.e. a narrower rectangle each step = zooming in.
      sumDepth += Math.log2(olderWidth / newerWidth);
    }
  }

  const lastDx = rectCenterX(current.rect) - rectCenterX(previous.rect);
  const lastDy = rectCenterY(current.rect) - rectCenterY(previous.rect);

  return {
    panX: sumX / pairs,
    panY: sumY / pairs,
    depthDelta: sumDepth / pairs,
    lastPanDistance: Math.hypot(lastDx, lastDy),
    currentSide: Math.min(rectWidth(current.rect), rectHeight(current.rect)),
  };
};

/** Whether a smoothed movement is an intentional pan and/or zoom (not jitter). */
const isNavigating = (movement: Movement): boolean => {
  const panned =
    Math.hypot(movement.panX, movement.panY) >=
    movement.currentSide * MIN_PAN_FRACTION;
  const zoomed = Math.abs(movement.depthDelta) >= MIN_ZOOM_LEVELS;
  return panned || zoomed;
};

/**
 * Predicts the next viewport by projecting the smoothed movement one step
 * forward. A pan translates the rectangle; a zoom both shifts the depth and
 * resizes the rectangle (shrinking when zooming in, growing when zooming out).
 * Returns `null` when there is too little history, the movement is jitter, or
 * the last step was a discontinuous jump rather than a drag.
 */
export const predictNextViewport = (
  history: readonly ViewportRegion[],
): ViewportRegion | null => {
  const movement = smoothedMovement(history);
  const current = history[history.length - 1];
  if (!movement || !current) {
    return null;
  }
  // A teleport (initial framing, jump-to) has no meaningful direction.
  if (movement.lastPanDistance > JUMP_FRACTION * movement.currentSide) {
    return null;
  }

  const panned =
    Math.hypot(movement.panX, movement.panY) >=
    movement.currentSide * MIN_PAN_FRACTION;
  const zoomed = Math.abs(movement.depthDelta) >= MIN_ZOOM_LEVELS;
  if (!panned && !zoomed) {
    return null;
  }

  // A predicted zoom resizes the rectangle by continuing the size ratio, capped
  // so a wild single scroll cannot explode the prediction.
  const depthStep = zoomed
    ? clampInt(movement.depthDelta, -MAX_DEPTH_STEP, MAX_DEPTH_STEP)
    : 0;
  const scale = 2 ** -depthStep;
  const halfWidth = (rectWidth(current.rect) * scale) / 2;
  const halfHeight = (rectHeight(current.rect) * scale) / 2;
  const centreX = rectCenterX(current.rect) + (panned ? movement.panX : 0);
  const centreY = rectCenterY(current.rect) + (panned ? movement.panY : 0);
  const depth = clampInt(
    Math.round(current.depth + depthStep),
    0,
    ATLAS_TILE_MAX_ZOOM,
  );

  return {
    rect: clampRectToWorld({
      x1: centreX - halfWidth,
      x2: centreX + halfWidth,
      y1: centreY - halfHeight,
      y2: centreY + halfHeight,
    }),
    depth,
  };
};

/** The one-tile border around a viewport at its depth (plus any new ancestors). */
const ringTiles = (region: ViewportRegion): AtlasTileCoordinate[] => {
  const tileSpan = WORLD_SIZE / 2 ** region.depth;
  const grown = clampRectToWorld({
    x1: region.rect.x1 - tileSpan,
    x2: region.rect.x2 + tileSpan,
    y1: region.rect.y1 - tileSpan,
    y2: region.rect.y2 + tileSpan,
  });
  return requiredTiles(grown, region.depth);
};

/**
 * Kicks off speculative prefetches for where the viewport is heading. Reads the
 * current viewport (the last history entry) and, while the user is actively
 * navigating, prefetches the surrounding ring plus — for a continuous drag or
 * scroll — the predicted-direction tiles, ranked nearest-first to the predicted
 * viewport and capped by the fullness-tapered budget. A no-op on a dwell, a jump
 * with no follow-through, or a full cache. Never awaited.
 *
 * @param currentKeys Tile keys the current viewport already required, so the
 *   ring never re-requests a tile this frame is loading anyway.
 */
export const schedulePrefetch = (
  cache: PrefetchCache,
  currentKeys: ReadonlySet<string>,
): void => {
  const { history } = cache;
  const current = history[history.length - 1];
  const movement = smoothedMovement(history);
  if (!current || !movement || !isNavigating(movement)) {
    return;
  }

  const budget = prefetchBudget(cache.fullness);
  if (budget <= 0) {
    return;
  }

  // The prediction is `null` on a jump; the ring still fires, ranked against the
  // current viewport so the nearest surrounding tiles win.
  const prediction = predictNextViewport(history);
  const bias = prediction ?? current;

  const seen = new Set<string>();
  const candidates: { coordinate: AtlasTileCoordinate; distance: number }[] =
    [];
  const consider = (coordinate: AtlasTileCoordinate): void => {
    const key = atlasTileKey(coordinate);
    if (currentKeys.has(key) || seen.has(key) || cache.has(coordinate)) {
      return;
    }
    seen.add(key);
    candidates.push({
      coordinate,
      distance: tileDistance(coordinate, bias.rect, bias.depth),
    });
  };

  for (const coordinate of ringTiles(current)) {
    consider(coordinate);
  }
  if (prediction) {
    for (const coordinate of requiredTiles(prediction.rect, prediction.depth)) {
      consider(coordinate);
    }
  }

  candidates.sort((a, b) => a.distance - b.distance);
  cache.prefetchBatch(
    candidates.slice(0, budget).map(({ coordinate }) => coordinate),
  );
};
