import { useLayoutEffect, useState } from "react";

import type { Size } from "@hashintel/petrinaut-core";

/**
 * Tracks the rendered size of `ref`'s element. Null until the element exists
 * and has a non-zero size — an element the surrounding layout has not sized
 * yet has nothing to show. Measurement happens before the browser paints, so
 * consumers gated on it never flash unmeasured content. Once measured, the
 * last non-zero size is kept even if the element collapses.
 */
export function useContainerSize(
  ref: React.RefObject<HTMLElement | null>,
): Size | null {
  const [size, setSize] = useState<Size | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width === 0 || height === 0) {
        return;
      }
      setSize((previous) =>
        previous && previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
