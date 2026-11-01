import { useLayoutEffect, useRef } from "react";

/**
 * Returns a ref that always contains the latest value.
 *
 * Useful for reading the current value of a prop or state from inside a
 * callback or passive effect without adding it to the dependency array.
 *
 * The ref is updated in a layout effect, so it's safe to read `.current` from:
 *   - event handlers and other callbacks fired after commit
 *   - `requestAnimationFrame` / `setTimeout` callbacks
 *   - `useEffect` (passive) bodies and their cleanups
 *
 * It is NOT safe to read `.current` during render in any component, or from a
 * `useLayoutEffect` that runs before this hook's layout effect — most notably
 * a layout effect in a descendant component (child layout effects run before
 * parent layout effects). If you need to read from those positions, pass the
 * value directly instead of going through this ref.
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
