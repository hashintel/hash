import { MotionValue, useMotionValue } from "motion/react";
import { useLayoutEffect } from "react";

import { getValueOrMotion } from "./use-value-or-motion";

/**
 * Hackish way to be sure to always manipulate MotionValues in certain places (like Filter), and prevent re-renders.
 * This is sub-optimal, but is easier at time of writing than a full solution.
 */
export function useToMotion<T>(value: T | MotionValue<T>): MotionValue<T> {
  const motionValue = useMotionValue(getValueOrMotion(value));
  useLayoutEffect(() => {
    motionValue.set(getValueOrMotion(value));
  }, [motionValue, value]);
  return value instanceof MotionValue ? value : motionValue;
}
