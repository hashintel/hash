import { useEffect, useRef } from "react";

/**
 * Hook to track the previous firingCount and compute the delta.
 *
 * Reading the ref during render is the whole point — we need to compare the
 * current render's value with the value committed by the previous effect run.
 * That requires opting out of two things:
 *   - the React Compiler, via `"use no memo"` (or it would memoize past the read)
 *   - the `react-hooks-js/refs` lint rule (which forbids ref reads in render)
 * Both are intentional and load-bearing — do not remove either.
 */
export function useFiringDelta(firingCount: number | null): number | null {
  "use no memo";
  const prevFiringCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (firingCount !== null) {
      prevFiringCountRef.current = firingCount;
    }
  }, [firingCount]);

  if (firingCount === null) {
    return null;
  }

  /* eslint-disable react-hooks-js/refs -- see the function-level comment. */
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
