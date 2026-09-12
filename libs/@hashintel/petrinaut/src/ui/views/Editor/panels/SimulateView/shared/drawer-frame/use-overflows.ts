import { useSyncExternalStore } from "react";

const subscribeToLayout = (
  element: HTMLElement | null,
  onChange: () => void,
): (() => void) => {
  if (!element || typeof ResizeObserver === "undefined") {
    return () => {};
  }
  const observer = new ResizeObserver(onChange);
  observer.observe(element);
  for (const child of element.children) {
    observer.observe(child);
  }
  return () => observer.disconnect();
};

/**
 * Whether `element` has more content than width, so it scrolls sideways. The
 * layout is the external store: read on every render and again after the
 * element or a child resizes. False without an element, and never stale
 * where `ResizeObserver` is missing (jsdom) because every render reads it
 * afresh.
 */
export const useOverflows = (element: HTMLElement | null): boolean =>
  useSyncExternalStore(
    (onChange) => subscribeToLayout(element, onChange),
    () => element !== null && element.scrollWidth - element.clientWidth > 1,
    () => false,
  );
