import { useEffect, type RefObject } from "react";

// sets up a resize observer on an element
export function useResizeObserver(
  elementRef: RefObject<HTMLElement | null>,
  func: (entries?: ResizeObserverEntry[]) => void,
): void {
  useEffect(() => {
    if (elementRef.current) {
      const resizeObserver = new ResizeObserver(func);

      resizeObserver.observe(elementRef.current);

      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [elementRef, func]);
}
