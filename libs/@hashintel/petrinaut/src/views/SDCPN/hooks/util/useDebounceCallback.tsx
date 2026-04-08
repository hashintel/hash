import { debounce, type DebouncedFunc } from "lodash-es";
import { useEffect, useMemo } from "react";

// debounces a function, holding the debounced function between re-renders
// when unmounting, we cancel any unresolved debounced to avoid resolving
// on possibly stale data
export function useDebounceCallback<T extends (...args: any) => ReturnType<T>>(
  func: T,
  delay = 500,
): DebouncedFunc<T> {
  const debounced = useMemo(() => debounce(func, delay), [func, delay]);

  // Update the debounced function ref whenever func, wait, or options change
  useEffect(() => {
    return () => {
      debounced.cancel();
    };
  }, []);

  return debounced;
}
