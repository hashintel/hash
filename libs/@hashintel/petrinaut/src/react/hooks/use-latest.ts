import { useLayoutEffect, useRef } from "react";

/**
 * Returns a ref that always contains the latest value.
 *
 * This hook is useful when you need to access the current value of a prop or state
 * inside a callback or effect without adding it to the dependency array. The ref
 * is updated in a layout effect, so passive effects observe the latest value
 * without reading or writing refs during render.
 *
 * @example
 * ```ts
 * const countRef = useLatest(count);
 *
 * useEffect(() => {
 *   const interval = setInterval(() => {
 *     // Always accesses the latest count value without re-running the effect
 *     console.log(countRef.current);
 *   }, 1000);
 *   return () => clearInterval(interval);
 * }, []); // No need to include count in dependencies
 * ```
 *
 * @param value - The value to keep in the ref
 * @returns A ref object whose `.current` property is always the latest value
 */
export function useLatest<T>(value: T): React.RefObject<T> {
  const ref = useRef(value);

  useLayoutEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}
