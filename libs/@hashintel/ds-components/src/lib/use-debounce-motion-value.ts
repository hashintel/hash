import { MotionValue, useMotionValue } from "motion/react";
import { useEffect, useRef } from "react";

import { getValueOrMotion } from "./use-value-or-motion";

export function useDebounceMotionValue(
  value: number | MotionValue<number>,
  delay = 200,
): MotionValue<number> {
  const debounced = useMotionValue(getValueOrMotion(value));

  const timeout = useRef<number>(0);

  useEffect(() => {
    if (value instanceof MotionValue) {
      const unsubscribe = value.on("change", (latest) => {
        window.clearTimeout(timeout.current);
        timeout.current = window.setTimeout(() => {
          debounced.set(latest);
        }, delay);
      });
      return () => {
        clearTimeout(timeout.current);
        unsubscribe();
      };
    } else {
      window.clearTimeout(timeout.current);
      timeout.current = window.setTimeout(() => {
        debounced.set(value);
      }, delay);
      return () => {
        clearTimeout(timeout.current);
      };
    }
  }, [value, delay, debounced]);

  return debounced;
}
