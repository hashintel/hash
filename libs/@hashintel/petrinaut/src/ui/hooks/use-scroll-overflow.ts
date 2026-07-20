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
 * on scroll, when the element or its children resize, and when rows are
 * added/removed.
 */
export const useScrollOverflow = (): ScrollOverflow => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const onScroll = () => {
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

    const measure = () => {
      setCanScrollUp(el.scrollTop > 0);
      setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
    };

    measure();

    // Observe the container and its children so the state tracks viewport and
    // content-height changes. `observe` is idempotent, so re-observing on
    // child-list changes keeps newly added rows tracked without tearing the
    // observers down. Set up once on mount rather than every render.
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(el);

    const observeChildren = () => {
      for (const child of el.children) {
        resizeObserver.observe(child);
      }
    };
    observeChildren();

    const mutationObserver = new MutationObserver(() => {
      observeChildren();
      measure();
    });
    mutationObserver.observe(el, { childList: true });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return { scrollRef, canScrollUp, canScrollDown, onScroll };
};
