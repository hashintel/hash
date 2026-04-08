import { debounce, type DebouncedFunc } from "lodash-es";
import { useEffect, useMemo } from "react";

// debounces a function, holding the debounced function between re-renders
// when unmounting, we flush any unresolved debounced calls when updating the debounced
// function or unmounting to avoid resolving on stale data or refs
export function useDebounceCallback<T extends (...args: any) => ReturnType<T>>(
  func: T,
  delay = 500,
): DebouncedFunc<T> {
  const debounced = useMemo(() => debounce(func, delay), [func, delay]);

  useEffect(() => {
    return () => {
      debounced.flush();
    };
  }, [func, delay]);

  return debounced;
}
