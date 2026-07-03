/**
 * How strongly a top-level bubble resists moving during an incremental refine.
 *
 * Centrality: weight is ~1 at viewport centre, decaying (Gaussian) to
 * {@link VIEWPORT_ANCHOR_FLOOR} once a bubble is roughly off-screen. The
 * falloff radius is the visible half-diagonal in world units, so it scales
 * with zoom.
 *
 * Zoom amplification: inertia is penalised in world units, but the user
 * perceives screen units. A world-space wobble is magnified by `scale`
 * when zoomed in. The on-screen pin is amplified by `scale` (clamped >= 1
 * so zooming out keeps the baseline), applied only to the centrality term
 * so off-screen bubbles remain free to reflow.
 */

import type { ViewportState } from "../../hierarchy/lod";

/** Off-screen bubbles keep this much anchor: they reflow but don't teleport while
 * the user isn't looking. Also the floor of {@link viewportAnchorWeight}.
 * The live value comes from `topLevelPolish.viewportAnchorFloor`. */
export const VIEWPORT_ANCHOR_FLOOR = 0.05;

export function viewportAnchorWeight(
  worldX: number,
  worldY: number,
  viewport: ViewportState,
  floor: number = VIEWPORT_ANCHOR_FLOOR,
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
  return floor + (1 - floor) * falloff * zoomStrength;
}
