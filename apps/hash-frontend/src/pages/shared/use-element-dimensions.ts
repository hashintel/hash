import type { RefCallback } from "react";
import { useCallback, useEffect, useState } from "react";

/**
 * Adapted from https://github.com/imbhargav5/rooks/blob/main/packages/rooks/src/hooks/useResizeObserverRef.ts
 */
const useElementBorderBoxSize = <T extends HTMLElement>(): {
  dimensions: { width: number; height: number } | null;
  element: T | null;
  ref: RefCallback<T>;
} => {
  const [node, setNode] = useState<T | null>(null);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (node) {
      const observer = new ResizeObserver(([entry]) => {
        if (entry?.borderBoxSize[0]) {
          setDimensions({
            width: entry.borderBoxSize[0].inlineSize,
            height: entry.borderBoxSize[0].blockSize,
          });
        }
      });

      observer.observe(node, { box: "border-box" });

      return () => {
        observer.disconnect();
      };
    }
  }, [node]);

  const ref = useCallback((el: T | null) => {
    setNode(el);

    if (el) {
      const { width, height } = el.getBoundingClientRect();
      setDimensions({ width, height });
    }
  }, []);

  return {
    dimensions,
    element: node,
    ref,
  };
};

export { useElementBorderBoxSize };
