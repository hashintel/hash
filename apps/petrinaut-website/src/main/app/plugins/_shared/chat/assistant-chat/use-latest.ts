import { type RefObject, useLayoutEffect, useRef } from "react";

/**
 * A ref holding the latest value, updated in a layout effect. Read it from
 * callbacks, timers and passive effects, never during render or from a
 * descendant's layout effect, which runs before this one.
 */
export const useLatest = <T>(value: T): RefObject<T> => {
  const ref = useRef(value);

  useLayoutEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
};
