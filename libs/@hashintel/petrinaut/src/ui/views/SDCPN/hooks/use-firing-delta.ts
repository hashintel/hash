import { useEffect, useRef } from "react";

/**
 * Hook to track the previous firingCount and compute the delta.
 */
export function useFiringDelta(firingCount: number | null): number | null {
  "use no memo"; // Intentionally reads ref during render — incompatible with React Compiler
  const prevFiringCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (firingCount !== null) {
      prevFiringCountRef.current = firingCount;
    }
  }, [firingCount]);

  if (firingCount === null) {
    return null;
  }

  /* eslint-disable react-hooks-js/refs -- This hook intentionally compares the current render with the previous committed frame. */
  const previousFiringCount = prevFiringCountRef.current;

  // On first render (ref not yet initialized) or no change, return null
  // This prevents triggering a large "fake" animation when mounting
  // while viewing a later frame
  if (previousFiringCount === null || firingCount === previousFiringCount) {
    return null;
  }

  const delta = firingCount - previousFiringCount;
  /* eslint-enable react-hooks-js/refs */

  // Ignore negative deltas (e.g., when scrubbing backwards)
  return delta > 0 ? delta : null;
}
