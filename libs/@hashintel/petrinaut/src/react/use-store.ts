import { useSyncExternalStore } from "react";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/with-selector";

import type { ReadableStore } from "@hashintel/petrinaut-core";

export function useStore<T>(store: ReadableStore<T>): T {
  return useSyncExternalStore(
    (onStoreChange) => store.subscribe(onStoreChange),
    () => store.get(),
    // The same value where a component is rendered to a string.
    () => store.get(),
  );
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

/**
 * One part of a store's value: the reader renders when that part changes.
 * For a part built in `selector`, pass `isSame`.
 */
export function useStoreSelector<T, U>(
  store: ReadableStore<T>,
  selector: (value: T) => U,
  isSame?: (previous: U, next: U) => boolean,
): U {
  return useSyncExternalStoreWithSelector(
    (onStoreChange) => store.subscribe(onStoreChange),
    () => store.get(),
    () => store.get(),
    selector,
    isSame,
  );
}
