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
 * Returns `null` until the element is mounted and the first observation fires.
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

  useEffect(() => {
    const el = ref.current;
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

    return () => {
      ro.disconnect();
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [ref, debounceMs]);

  return size;
}
