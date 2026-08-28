import { useEffect, useRef, useState, type RefObject } from "react";

interface ElementSize {
  width: number;
  height: number;
}

interface UseElementSizeOptions {
  /**
   * Debounce interval in milliseconds. When set, the returned size only
   * updates at most once per interval, batching rapid resize events.
   * Useful for expensive downstream work (e.g. chart recreation).
   * Defaults to 0 (no debounce — updates on every ResizeObserver callback).
   */
  debounce?: number;
}

/**
 * Returns the content-box size of a DOM element, kept in sync via ResizeObserver.
 *
 * Returns `null` until the element is mounted and the first observation fires,
 * and again while the element is unmounted — the element may mount later than
 * the hook (e.g. a chart root that only renders once data exists) or be
 * swapped, and the observer follows it.
 *
 * Supports an optional `debounce` interval to throttle updates.
 *
 * @example
 * ```tsx
 * const ref = useRef<HTMLDivElement>(null);
 * const size = useElementSize(ref, { debounce: 100 });
 *
 * return <div ref={ref}>{size && `${size.width} × ${size.height}`}</div>;
 * ```
 */
export function useElementSize(
  ref: RefObject<HTMLElement | null>,
  options?: UseElementSizeOptions,
): ElementSize | null {
  "use no memo"; // imperative observer + timer management
  const [size, setSize] = useState<ElementSize | null>(null);
  const debounceMs = options?.debounce ?? 0;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observedRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  // Deliberately no dependency array: a RefObject gives no signal when its
  // `.current` changes, and the observed element can mount after the first
  // commit or be swapped for another — so re-check its identity after every
  // render, and only re-subscribe when the element actually changed.
  useEffect(() => {
    const el = ref.current;
    if (el === observedRef.current) {
      return;
    }

    observerRef.current?.disconnect();
    observerRef.current = null;
    observedRef.current = el;

    // While no element is mounted the last size is kept, not reset: callers
    // gate rendering on the element's presence anyway, and the next
    // observation corrects any drift.
    if (!el) {
      return;
    }

    const update = (width: number, height: number) => {
      setSize((prev) => {
        if (prev && prev.width === width && prev.height === height) {
          return prev; // avoid spurious re-renders
        }
        return { width, height };
      });
    };

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      if (debounceMs > 0) {
        if (timerRef.current != null) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => {
          update(width, height);
          timerRef.current = null;
        }, debounceMs);
      } else {
        update(width, height);
      }
    });

    ro.observe(el);
    observerRef.current = ro;
  });

  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [],
  );

  return size;
}
