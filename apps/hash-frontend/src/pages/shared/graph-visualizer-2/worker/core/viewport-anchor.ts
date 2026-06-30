/**
 * How strongly a top-level bubble resists moving during an incremental refine,
 * derived from where it sits on the user's screen.
 *
 * Two ideas combine:
 * - CENTRALITY: pin what the user is looking at, let the rest reflow. The weight
 *   is ~1 at the viewport centre and decays (Gaussian) to {@link
 *   VIEWPORT_ANCHOR_FLOOR} once a bubble is roughly off-screen. The falloff
 *   radius is the viewport's visible half-diagonal in WORLD units, so it scales
 *   with zoom: zoomed in, only the few central bubbles are held; zoomed out,
 *   most of the graph is.
 * - ZOOM (screen-space stability): the inertia is penalised in WORLD units, but
 *   the user perceives SCREEN units, and `scale = 2**zoom` is screen px per world
 *   unit. So a wobble that's negligible in the world is magnified by `scale` when
 *   zoomed in — a bubble you've zoomed right into visibly drifts even though it
 *   barely moved. We amplify the on-screen pin by `scale` (clamped to ≥ 1× so
 *   zooming OUT keeps the baseline) to hold the focused bubble's SCREEN movement
 *   roughly constant across zoom. The amplification multiplies only the centrality
 *   term, so off-screen bubbles stay at the floor and remain free to reflow.
 */

import type { ViewportState } from "../hierarchy/lod";

/** Off-screen bubbles keep this much anchor: they reflow but don't teleport while
 * the user isn't looking. Also the floor of {@link viewportAnchorWeight}. */
export const VIEWPORT_ANCHOR_FLOOR = 0.05;

export function viewportAnchorWeight(
  worldX: number,
  worldY: number,
  viewport: ViewportState,
): number {
  const scale = 2 ** viewport.zoom;
  const visibleRadius =
    Math.hypot(viewport.width, viewport.height) / 2 / Math.max(scale, 1e-6);
  if (!(visibleRadius > 0)) {
    return 1;
  }
  const distance = Math.hypot(
    worldX - viewport.centerX,
    worldY - viewport.centerY,
  );
  const falloff = Math.exp(-((distance / visibleRadius) ** 2));
  // Amplify only the on-screen (high-falloff) term by the zoom, never below 1×.
  // Off-screen bubbles have falloff ≈ 0, so they stay at the floor at any zoom.
  const zoomStrength = Math.max(1, scale);
  return (
    VIEWPORT_ANCHOR_FLOOR + (1 - VIEWPORT_ANCHOR_FLOOR) * falloff * zoomStrength
  );
}
