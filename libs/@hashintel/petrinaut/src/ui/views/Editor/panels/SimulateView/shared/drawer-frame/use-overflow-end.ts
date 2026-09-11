import { useSyncExternalStore } from "react";

/**
 * How a line that scrolls sideways stands: `none` when everything fits,
 * `more` when there is content past its right edge, `end` when it overflows
 * but is scrolled to the end.
 */
export type OverflowState = "none" | "more" | "end";

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

const readOverflow = (element: HTMLElement | null): OverflowState => {
  if (element === null) {
    return "none";
  }
  const hidden = element.scrollWidth - element.clientWidth;
  if (hidden <= 1) {
    return "none";
  }
  return hidden - element.scrollLeft > 1 ? "more" : "end";
};

/**
 * Whether `element` scrolls sideways and, when it does, whether there is
 * content past its right edge. The layout is the external store: read on
 * every render and again after the element or a child resizes or scrolls.
 * `none` without an element, and never stale where `ResizeObserver` is
 * missing (jsdom) because every render reads it afresh.
 */
export const useOverflowEnd = (element: HTMLElement | null): OverflowState =>
  useSyncExternalStore(
    (onChange) => subscribeToLayout(element, onChange),
    () => readOverflow(element),
    () => "none",
  );
