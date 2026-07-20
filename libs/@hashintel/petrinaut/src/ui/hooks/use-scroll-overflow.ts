import { useEffect, useRef, useState } from "react";

interface ScrollOverflow {
  /** Attach to the scrollable element. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** True when the element is scrolled down from the top. */
  canScrollUp: boolean;
  /** True when there is more content to scroll to below the viewport. */
  canScrollDown: boolean;
  /** Pass to the scrollable element's `onScroll`. */
  onScroll: () => void;
}

/**
 * Tracks whether a scrollable element can scroll further up or down, so a
 * caller can render fade/shadow affordances at the overflowing edges. Re-checks
 * on scroll and whenever the element or its children resize.
 */
export const useScrollOverflow = (): ScrollOverflow => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const update = () => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    setCanScrollUp(el.scrollTop > 0);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    update();

    // Observe the element and its children so the state stays correct as the
    // viewport or the content height changes. Re-subscribes each render so
    // dynamically added/removed children stay observed.
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of el.children) {
      observer.observe(child);
    }

    return () => observer.disconnect();
  });

  return { scrollRef, canScrollUp, canScrollDown, onScroll: update };
};
