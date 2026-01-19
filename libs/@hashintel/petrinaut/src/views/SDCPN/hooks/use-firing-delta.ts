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

  if (firingCount === prevFiringCountRef.current) {
    return null;
  }

  const prevCount = prevFiringCountRef.current ?? 0;
  const delta = firingCount - prevCount;

  return delta;
}
