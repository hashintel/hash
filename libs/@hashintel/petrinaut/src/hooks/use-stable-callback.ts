import { useCallback, useEffect, useRef } from "react";

/**
 * Returns a stable callback function that always calls the latest version of the provided function.
 *
 * This hook is useful when you need to use a callback in a `useEffect` or `useCallback` dependency
 * array without causing unnecessary re-renders or effect re-runs. The returned function has a
 * stable identity and will always forward calls to the most recent version of the callback.
 *
 * @example
 * ```ts
 * const stableOnChange = useStableCallback(onChange);
 *
 * useEffect(() => {
 *   // stableOnChange has a stable identity, so this effect won't re-run when onChange changes
 *   stableOnChange(value);
 * }, [value, stableOnChange]);
 * ```
 *
 * @param callback - The callback function to stabilize
 * @returns A stable function that forwards calls to the latest callback
 */
export function useStableCallback<T extends (...args: never[]) => unknown>(
  callback: T,
): T {
  const ref = useRef(callback);

  useEffect(() => {
    ref.current = callback;
  }, [callback]);

  return useCallback(((...args) => ref.current(...args)) as T, []);
}
