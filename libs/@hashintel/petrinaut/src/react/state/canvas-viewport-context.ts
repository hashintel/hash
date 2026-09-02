import { createContext } from "react";

/** Where the canvas looks: screen = scene × zoom + (x, y), in canvas pixels. */
export type CanvasViewport = { x: number; y: number; zoom: number };

export type CanvasViewportContextValue = {
  /**
   * The viewport last saved for the active document, or null when the
   * document has never been viewed. Renderers read it when they mount and fit
   * the net when it is null.
   */
  savedViewport: CanvasViewport | null;
  /**
   * Saves the viewport for the active document. Renderers call it on every
   * move; writes are coalesced before they reach the settings store.
   */
  rememberViewport: (viewport: CanvasViewport) => void;
};

export const CanvasViewportContext = createContext<CanvasViewportContextValue>({
  savedViewport: null,
  rememberViewport: () => {},
});
