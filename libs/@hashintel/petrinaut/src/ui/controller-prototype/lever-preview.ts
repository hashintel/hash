import { useSyncExternalStore } from "react";

import { requestRevealOnCanvas } from "./show-on-canvas";

/** The node a lever field's dropdown row is hovered on, ringed on the canvas. */
let previewId: string | null = null;
const listeners = new Set<() => void>();

let pending: string | null = null;
let restoreTimer = 0;
let clearTimer = 0;
let frame: number | null = null;

/** Faster than the canvas's usual focus fade, so moving down the list keeps up. */
const PREVIEW_FOCUS_DURATION = "90ms";

/**
 * Sets the previewed node, at most once per frame: sweeping down the list
 * rebuilds the canvas focus for the row the pointer ends on, not every row
 * it crossed. Pans the canvas when the node is off screen.
 */
export const setLeverPreview = (nodeId: string | null): void => {
  window.clearTimeout(clearTimer);
  pending = nodeId;
  if (frame !== null) {
    return;
  }
  frame = requestAnimationFrame(() => {
    frame = null;
    if (previewId === pending) {
      return;
    }
    previewId = pending;
    const root = document.documentElement;
    window.clearTimeout(restoreTimer);
    root.style.setProperty("--canvas-focus-duration", PREVIEW_FOCUS_DURATION);
    if (previewId === null) {
      // The fade back runs fast too; the usual timing returns after it.
      restoreTimer = window.setTimeout(
        () => root.style.removeProperty("--canvas-focus-duration"),
        200,
      );
    } else {
      requestRevealOnCanvas(previewId);
    }
    for (const listener of listeners) {
      listener();
    }
  });
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useLeverPreview = (): string | null =>
  useSyncExternalStore(
    subscribe,
    () => previewId,
    () => null,
  );

/**
 * Clears the preview shortly after the pointer leaves a row, unless it
 * enters another row first, so moving between rows never flashes the
 * controller's own focus in between.
 */
export const clearLeverPreviewSoon = (): void => {
  window.clearTimeout(clearTimer);
  clearTimer = window.setTimeout(() => setLeverPreview(null), 80);
};
