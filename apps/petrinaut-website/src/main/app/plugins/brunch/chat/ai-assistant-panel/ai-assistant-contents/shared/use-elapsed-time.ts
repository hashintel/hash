import { useEffect, useRef, useState } from "react";

/**
 * Measures observed activity across active periods, so a pause does not
 * restart it; settled history without timing stays unknown.
 */
export const useElapsedTime = (active: boolean): number | undefined => {
  const [elapsed, setElapsed] = useState<number>();
  const completedRef = useRef(0);
  useEffect(() => {
    if (!active) return;
    const startedAt = Date.now();
    const total = () => completedRef.current + Date.now() - startedAt;
    const interval = setInterval(() => setElapsed(total()), 100);
    return () => {
      clearInterval(interval);
      completedRef.current = total();
      setElapsed(completedRef.current);
    };
  }, [active]);
  return elapsed;
};
