import { useCallback, useSyncExternalStore } from "react";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/with-selector";

import type { ReadableStore } from "@hashintel/petrinaut-core";

export function useStore<T>(store: ReadableStore<T>): T {
  const subscribe = useCallback(
    (onStoreChange: () => void) => store.subscribe(onStoreChange),
    [store],
  );
  const getSnapshot = useCallback(() => store.get(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * A value selected from `store`; the caller re-renders when `isEqual`, by
 * default `Object.is`, tells the selected value changed.
 */
export function useStoreSelector<T, U>(
  store: ReadableStore<T>,
  selector: (value: T) => U,
  isEqual?: (previous: U, next: U) => boolean,
): U {
  const subscribe = useCallback(
    (onStoreChange: () => void) => store.subscribe(onStoreChange),
    [store],
  );
  const getSnapshot = useCallback(() => store.get(), [store]);
  return useSyncExternalStoreWithSelector(
    subscribe,
    getSnapshot,
    undefined,
    selector,
    isEqual,
  );
}
