import { useEffect, useState } from "react";

/** Measures observed activity; settled history without timing stays unknown. */
export const useElapsedTime = (active: boolean): number | undefined => {
  const [elapsed, setElapsed] = useState<number>();
  useEffect(() => {
    if (!active) return;
    const startedAt = Date.now();
    const update = () => setElapsed(Date.now() - startedAt);
    const interval = setInterval(update, 100);
    return () => {
      clearInterval(interval);
      update();
    };
  }, [active]);
  return elapsed;
};
