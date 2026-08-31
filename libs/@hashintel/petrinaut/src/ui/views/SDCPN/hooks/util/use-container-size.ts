import { useLayoutEffect, useState } from "react";

import type { Size } from "@hashintel/petrinaut-core";

/**
 * Tracks the rendered size of `ref`'s element. Null until the element exists
 * and has a non-zero size — an element the surrounding layout has not sized
 * yet has nothing to show. The first real size is reported before the browser
 * paints, so consumers gated on it never flash unmeasured content. Later
 * changes are reported only once the size has held still for `settleMs`, so a
 * window resize or panel animation re-renders consumers once instead of once
 * per frame. Once measured, the last non-zero size is kept even if the
 * element collapses.
 */
export function useContainerSize(
  ref: React.RefObject<HTMLElement | null>,
  settleMs: number,
): Size | null {
  const [size, setSize] = useState<Size | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    let measured = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width === 0 || height === 0) {
        return;
      }
      measured = true;
      setSize((previous) =>
        previous && previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };

    measure();

    const observer = new ResizeObserver(() => {
      // The first real size mounts the canvas, so it must not wait.
      if (!measured) {
        measure();
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(measure, settleMs);
    });
    observer.observe(element);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [ref, settleMs]);

  return size;
}
