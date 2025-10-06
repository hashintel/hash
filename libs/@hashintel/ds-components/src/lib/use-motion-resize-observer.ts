import type { MotionValue } from "motion/react";
import { useMotionValue } from "motion/react";
import { useLayoutEffect, useRef } from "react";

export interface UseMotionResizeObserverReturn<
  T extends HTMLElement = HTMLElement,
> {
  /**
   * Ref to attach to the DOM element you want to observe
   */
  ref: React.RefObject<T | null>;
  /**
   * MotionValue containing the current width of the observed element
   */
  width: MotionValue<number>;
  /**
   * MotionValue containing the current height of the observed element
   */
  height: MotionValue<number>;
}

export interface UseMotionResizeObserverOptions {
  /**
   * Initial width value for the MotionValue
   * @default 0
   */
  initialWidth?: number;
  /**
   * Initial height value for the MotionValue
   * @default 0
   */
  initialHeight?: number;
}

/**
 * A React hook that uses ResizeObserver to track a DOM element's dimensions
 * and returns the width and height as MotionValues.
 *
 * @param options Configuration options for initial values
 * @returns An object containing the ref to attach to the element and MotionValues for width/height
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { ref, width, height } = useMotionResizeObserver();
 *
 *   useLayoutEffect(() => {
 *     const unsubscribe = width.on("change", (newWidth) => {
 *       console.log("Width changed to:", newWidth);
 *     });
 *     return unsubscribe;
 *   }, [width]);
 *
 *   return (
 *     <div ref={ref} style={{ resize: "both", overflow: "auto" }}>
 *       Resizable content
 *     </div>
 *   );
 * }
 * ```
 */
export function useMotionResizeObserver<T extends HTMLElement = HTMLElement>(
  options: UseMotionResizeObserverOptions = {},
): UseMotionResizeObserverReturn<T> {
  const { initialWidth = 0, initialHeight = 0 } = options;

  const ref = useRef<T>(null);
  const width = useMotionValue(initialWidth);
  const height = useMotionValue(initialHeight);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Use borderBoxSize for more accurate dimensions including padding and border
        const borderBoxSize = entry.borderBoxSize[0];
        if (borderBoxSize) {
          width.set(borderBoxSize.inlineSize);
          height.set(borderBoxSize.blockSize);
        } else {
          // Fallback to contentRect for older browsers
          const { width: observedWidth, height: observedHeight } =
            entry.contentRect;
          width.set(observedWidth);
          height.set(observedHeight);
        }
      }
    });

    // Observe the element
    resizeObserver.observe(element);

    // Set initial dimensions if the element is already rendered
    requestAnimationFrame(() => {
      const rect = element.getBoundingClientRect();
      width.set(rect.width);
      height.set(rect.height);
    });

    // Cleanup function
    return () => {
      resizeObserver.unobserve(element);
      resizeObserver.disconnect();
    };
  }, [width, height]);

  return {
    ref,
    width,
    height,
  };
}
