import { toNetId } from "@hashintel/petrinaut-core";

import type { SavedCanvasViewport } from "../canvas-viewport-context";

/**
 * The viewports record keyed by net id, so a viewport saved under a legacy
 * document id follows the converted net. When two keys convert to the same
 * net id, the later save wins.
 */
export const canonicalizeViewportKeys = (
  viewports: Record<string, SavedCanvasViewport>,
): Record<string, SavedCanvasViewport> => {
  const canonical = new Map<string, SavedCanvasViewport>();
  for (const [documentId, entry] of Object.entries(viewports)) {
    const netId = toNetId(documentId);
    const kept = canonical.get(netId);
    if (!kept || (entry.savedAt ?? 0) > (kept.savedAt ?? 0)) {
      canonical.set(netId, entry);
    }
  }
  return Object.fromEntries(canonical);
};
