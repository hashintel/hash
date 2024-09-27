import { useRef } from "react";

/**
 * A version of useMemo which returns the previous value if the new value is the same according to the provided comparison function.
 * @param factory a function which returns the value to memoize.
 * @param dependencies The dependencies of the function – if any of these are not strictly equal, the factory function is re-run.
 * @param isReturnUnchanged
 *    a function which should return true if the two arguments are considered equal,
 *    in which case the same previous value will be returned (i.e. the return will strictly equal the previous value).
 */
export const useMemoCompare = <Return, Dependencies extends unknown[]>(
  factory: () => Return,
  dependencies: Dependencies,
  isReturnUnchanged: (oldValue: Return, newValue: Return) => boolean,
): Return => {
  const previousDependenciesRef = useRef<Dependencies>(dependencies);
  const previousValueRef = useRef<Return>();
  const hasRunOnceRef = useRef(false);

  let shouldComputeReturn = false;
  if (
    !hasRunOnceRef.current ||
    dependencies.length !== previousDependenciesRef.current.length ||
    dependencies.some((dep, i) => dep !== previousDependenciesRef.current[i])
  ) {
    shouldComputeReturn = true;
  }

  if (shouldComputeReturn) {
    const newValue = factory();

    if (
      !hasRunOnceRef.current ||
      !isReturnUnchanged(previousValueRef.current as Return, newValue)
    ) {
      previousValueRef.current = newValue;
    }

    if (!hasRunOnceRef.current) {
      hasRunOnceRef.current = true;
    }

    previousDependenciesRef.current = dependencies;
  }

  return previousValueRef.current as Return;
};
