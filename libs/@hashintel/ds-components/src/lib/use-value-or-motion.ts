import { MotionValue, useTransform } from "motion/react";

export function getValueOrMotion<T>(value: T | MotionValue<T>): T {
  return value instanceof MotionValue ? value.get() : value;
}

export function useValueOrMotion<T>(value: T | MotionValue<T>): MotionValue<T> {
  return useTransform(() => getValueOrMotion(value));
}
