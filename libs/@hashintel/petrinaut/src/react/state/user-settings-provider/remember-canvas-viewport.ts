import type {
  CanvasViewport,
  SavedCanvasViewport,
} from "../canvas-viewport-context";

/** How many documents keep a saved viewport before the oldest is dropped. */
export const rememberedViewportLimit = 50;

const savedAtOf = (entry: SavedCanvasViewport) => entry.savedAt ?? 0;

/**
 * The viewports record with `viewport` stamped and saved for `petriNetId`,
 * capped so settings do not grow with every net ever opened. The least
 * recently saved entries go first, read off the stamps: key order cannot say
 * which those are, because JavaScript enumerates integer-like keys numerically
 * and a document id is an unrestricted string.
 */
export const rememberCanvasViewport = (
  viewports: Record<string, SavedCanvasViewport>,
  petriNetId: string,
  viewport: CanvasViewport,
  savedAt: number,
  limit = rememberedViewportLimit,
): Record<string, SavedCanvasViewport> => {
  const others = Object.entries(viewports)
    .filter(([id]) => id !== petriNetId)
    .sort(([, first], [, second]) => savedAtOf(first) - savedAtOf(second));
  const kept = others.slice(Math.max(0, others.length - (limit - 1)));
  return Object.fromEntries([...kept, [petriNetId, { ...viewport, savedAt }]]);
};
