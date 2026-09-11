import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Whether an element overlaps the viewport, kept in sync via
 * IntersectionObserver.
 *
 * A panel that is closed but kept mounted is moved off the viewport rather
 * than unmounted, so its contents keep running: this reports that, whatever
 * the mechanism — a panel slid away, a page scrolled past, a container
 * clipped — so work nobody can see can be skipped.
 *
 * Starts `true` and stays `true` where IntersectionObserver is unavailable,
 * so a caller that gates work on it does that work rather than never doing
 * it.
 *
 * @example
 * ```tsx
 * const ref = useRef<HTMLDivElement>(null);
 * const onScreen = useElementOnScreen(ref);
 *
 * return <div ref={ref}>{onScreen ? <Chart /> : null}</div>;
 * ```
 */
export function useElementOnScreen(ref: RefObject<Element | null>): boolean {
  "use no memo"; // imperative observer management

  const [onScreen, setOnScreen] = useState(true);
  const observedRef = useRef<Element | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Deliberately no dependency array, following `useElementSize`: a RefObject
  // gives no signal when its `.current` changes, and the observed element can
  // mount after the first commit — so re-check its identity after every
  // render, and only re-subscribe when the element actually changed.
  useEffect(() => {
    const element = ref.current;
    if (element === observedRef.current) {
      return;
    }

    observerRef.current?.disconnect();
    observerRef.current = null;
    observedRef.current = element;

    // With no element, or no observer to watch it with, the last answer
    // stands; the next observation corrects any drift.
    if (!element || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) {
        setOnScreen(entry.isIntersecting);
      }
    });

    observer.observe(element);
    observerRef.current = observer;
  });

  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      // A replayed setup (Strict Mode) must observe the element again.
      observedRef.current = null;
    },
    [],
  );

  return onScreen;
}
