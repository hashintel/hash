import { useEffect, useState } from "react";

/**
 * Returns `value`, trailing changes by `delayMs`: the returned value only
 * updates once `value` has held still for that long.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
