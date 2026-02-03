import { useRef } from "react";

/**
 * Returns a ref that always contains the latest value.
 *
 * This hook is useful when you need to access the current value of a prop or state
 * inside a callback or effect without adding it to the dependency array. The ref
 * is updated synchronously during render, so it's immediately available to other
 * effects in the same render cycle.
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

  // Update synchronously during render (not in effect) so the ref is
  // immediately available to other effects in the same render cycle
  ref.current = value;

  return ref;
}
