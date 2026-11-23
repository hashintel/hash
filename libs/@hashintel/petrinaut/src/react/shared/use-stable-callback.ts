import { useCallback } from "react";

import { useLatest } from "./use-latest";

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
 * The latest callback is in place from the layout phase of the commit that
 * changed it (see `useLatest`), so an effect of that commit calls the new one.
 *
 * The `Args`/`Return` split preserves parameter names via tuple inference but
 * does NOT preserve overloads or function-with-properties types. If you
 * need either, capture the function in a ref directly instead.
 *
 * @param callback - The callback function to stabilize
 * @returns A stable function that forwards calls to the latest callback
 */
export function useStableCallback<Args extends unknown[], Return>(
  callback: (...args: Args) => Return,
): (...args: Args) => Return {
  const latest = useLatest(callback);

  // One identity is this hook's contract, so it does not rest on the compiler.
  return useCallback((...args: Args) => latest.current(...args), [latest]);
}
