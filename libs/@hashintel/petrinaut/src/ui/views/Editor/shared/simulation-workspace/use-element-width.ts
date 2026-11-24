import { useSyncExternalStore } from "react";

const subscribeToSize = (
  element: HTMLElement | null,
  onChange: () => void,
): (() => void) => {
  if (!element || typeof ResizeObserver === "undefined") {
    return () => {};
  }
  const observer = new ResizeObserver(onChange);
  observer.observe(element);
  return () => observer.disconnect();
};

/**
 * The width of `element` in pixels, and zero without one.
 *
 * The layout is the external store: read on every render and again after
 * the element resizes. The render that first has the element has its width
 * too, so nothing is painted at a width that was not measured.
 */
export const useElementWidth = (element: HTMLElement | null): number =>
  useSyncExternalStore(
    (onChange) => subscribeToSize(element, onChange),
    () => element?.clientWidth ?? 0,
    () => 0,
  );
