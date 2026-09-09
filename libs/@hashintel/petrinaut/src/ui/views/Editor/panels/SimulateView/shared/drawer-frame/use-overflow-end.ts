import { useSyncExternalStore } from "react";

const subscribeToLayout = (
  element: HTMLElement | null,
  onChange: () => void,
): (() => void) => {
  if (!element) {
    return () => {};
  }
  element.addEventListener("scroll", onChange, { passive: true });
  if (typeof ResizeObserver === "undefined") {
    return () => element.removeEventListener("scroll", onChange);
  }
  const observer = new ResizeObserver(onChange);
  observer.observe(element);
  for (const child of element.children) {
    observer.observe(child);
  }
  return () => {
    observer.disconnect();
    element.removeEventListener("scroll", onChange);
  };
};

/**
 * Whether `element` has content past its right edge: it scrolls sideways and
 * is not scrolled to the end. The layout is the external store: read on
 * every render and again after the element or a child resizes or scrolls.
 * False without an element, and never stale where `ResizeObserver` is
 * missing (jsdom) because every render reads it afresh.
 */
export const useOverflowEnd = (element: HTMLElement | null): boolean =>
  useSyncExternalStore(
    (onChange) => subscribeToLayout(element, onChange),
    () =>
      element !== null &&
      element.scrollWidth - element.clientWidth - element.scrollLeft > 1,
    () => false,
  );
