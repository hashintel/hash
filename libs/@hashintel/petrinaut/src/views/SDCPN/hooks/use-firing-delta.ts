import { useEffect, useRef } from "react";

/**
 * Hook to track the previous firingCount and compute the delta.
 */
export function useFiringDelta(firingCount: number | null): number | null {
  const prevFiringCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (firingCount !== null) {
      prevFiringCountRef.current = firingCount;
    }
  }, [firingCount]);

  if (firingCount === null) {
    return null;
  }

  // On first render (ref not yet initialized) or no change, return null
  // This prevents triggering a large "fake" animation when mounting
  // while viewing a later frame
  if (
    prevFiringCountRef.current === null ||
    firingCount === prevFiringCountRef.current
  ) {
    return null;
  }

  const delta = firingCount - prevFiringCountRef.current;

  // Ignore negative deltas (e.g., when scrubbing backwards)
  return delta > 0 ? delta : null;
}
