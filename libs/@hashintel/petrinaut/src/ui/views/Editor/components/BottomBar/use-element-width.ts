import { useLayoutEffect, useState } from "react";

/**
 * Tracks the rendered width of `ref`'s element in CSS pixels, 0 until it has
 * been measured. Every change is reported, the frames of a CSS transition
 * included, so layout derived from the width stays in step with it.
 */
export const useElementWidth = (
  ref: React.RefObject<HTMLElement | null>,
): number => {
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const measure = () => setWidth(element.getBoundingClientRect().width);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }, [ref]);

  return width;
};
