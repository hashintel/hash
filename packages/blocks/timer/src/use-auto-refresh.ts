import { useEffect, useState } from "react";

export const useAutoRefresh = (active: boolean, targetFps = 25): void => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (active) {
      const timeout = setTimeout(() => {
        setTick(tick + 1);
      }, 1000 / targetFps);
      return () => {
        clearTimeout(timeout);
      };
    }
  }, [active, targetFps, tick]);
};
