import { createContext } from "react";

/** Where the canvas looks: screen = scene × zoom + (x, y), in canvas pixels. */
export type CanvasViewport = { x: number; y: number; zoom: number };

/**
 * A viewport as it is persisted. The stamp is what orders the entries for the
 * cap: object key order does not, because a document id that reads as an
 * integer is enumerated numerically rather than in insertion order.
 */
export type SavedCanvasViewport = CanvasViewport & {
  /** Absent on entries written before viewports carried a stamp. */
  savedAt?: number;
};

export type CanvasViewportContextValue = {
  /**
   * The viewport last saved for the active document, or null when the
   * document has never been viewed. Renderers read it when they mount and fit
   * the net when it is null.
   */
  savedViewport: CanvasViewport | null;
  /**
   * Saves the viewport for the active document. Renderers call it once a move
   * has settled, so each call is one write and a reload straight after a move
   * still comes back to it.
   */
  rememberViewport: (viewport: CanvasViewport) => void;
};

export const CanvasViewportContext = createContext<CanvasViewportContextValue>({
  savedViewport: null,
  rememberViewport: () => {},
});
