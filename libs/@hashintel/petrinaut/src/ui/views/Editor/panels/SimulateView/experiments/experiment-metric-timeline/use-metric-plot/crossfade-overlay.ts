/**
 * The canvas that bridges a content change on a plot: the picture on screen
 * is frozen into it, dimmed, and fades out once the new content is drawn.
 */
import type uPlot from "uplot";

const FROZEN_OPACITY = 0.55;
const FADE_MS = 300;

export type CrossfadeOverlay = {
  /** Snapshot the plot's drawing area over itself, dimmed. */
  freeze: () => void;
  /** Fade a frozen picture out; nothing happens unless one is showing. */
  fadeOut: () => void;
};

const mountCanvas = (over: HTMLElement): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  over.appendChild(canvas);
  return canvas;
};

/** The canvas lives in `plot.over`, so it goes away with the plot. */
export const createCrossfadeOverlay = (plot: uPlot): CrossfadeOverlay => {
  let canvas: HTMLCanvasElement | null = null;
  let state: "hidden" | "frozen" | "fading" = "hidden";

  return {
    freeze: () => {
      canvas ??= mountCanvas(plot.over);
      canvas.width = Math.max(1, Math.round(plot.bbox.width));
      canvas.height = Math.max(1, Math.round(plot.bbox.height));
      canvas
        .getContext("2d")!
        .drawImage(
          plot.ctx.canvas,
          plot.bbox.left,
          plot.bbox.top,
          plot.bbox.width,
          plot.bbox.height,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      canvas.style.transition = "none";
      canvas.style.display = "block";
      canvas.style.opacity = String(FROZEN_OPACITY);
      state = "frozen";
    },
    fadeOut: () => {
      if (state !== "frozen" || canvas === null) {
        return;
      }
      state = "fading";
      const fading = canvas;
      // The transition needs a frame with the frozen opacity painted first.
      requestAnimationFrame(() => {
        fading.style.transition = `opacity ${FADE_MS}ms ease-out`;
        fading.style.opacity = "0";
      });
      fading.addEventListener(
        "transitionend",
        () => {
          fading.style.display = "none";
          if (state === "fading") {
            state = "hidden";
          }
        },
        { once: true },
      );
    },
  };
};
