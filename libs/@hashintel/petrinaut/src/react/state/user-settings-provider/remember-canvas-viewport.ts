import type { CanvasViewport } from "../canvas-viewport-context";

/** How many documents keep a saved viewport before the oldest is dropped. */
export const rememberedViewportLimit = 50;

/**
 * The viewports record with `viewport` saved for `petriNetId`. The record is
 * kept in most-recently-saved order and capped, so settings do not grow with
 * every net ever opened.
 */
export const rememberCanvasViewport = (
  viewports: Record<string, CanvasViewport>,
  petriNetId: string,
  viewport: CanvasViewport,
  limit = rememberedViewportLimit,
): Record<string, CanvasViewport> => {
  const others = Object.entries(viewports).filter(([id]) => id !== petriNetId);
  const kept = others.slice(Math.max(0, others.length - (limit - 1)));
  return Object.fromEntries([...kept, [petriNetId, viewport]]);
};
