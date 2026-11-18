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

/** A store of one field of another store's value, for a context to hand out without subscribing to it. */
export const selectStore = <T, U>(
  store: ReadableStore<T>,
  select: (value: T) => U,
): ReadableStore<U> => ({
  get: () => select(store.get()),
  subscribe: (listener) => store.subscribe((value) => listener(select(value))),
});

export const constantStore = <T>(value: T): ReadableStore<T> => ({
  get: () => value,
  subscribe: () => () => {},
});

export function useStoreSelector<T, U>(
  store: ReadableStore<T>,
  selector: (value: T) => U,
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
  );
}
