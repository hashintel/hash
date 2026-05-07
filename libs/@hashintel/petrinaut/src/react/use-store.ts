import { useSyncExternalStore } from "react";

import type { ReadableStore } from "../core/handle";

export function useStore<T>(store: ReadableStore<T>): T {
  return useSyncExternalStore(
    (onStoreChange) => store.subscribe(() => onStoreChange()),
    () => store.get(),
  );
}

export function useStoreSelector<T, U>(
  store: ReadableStore<T>,
  selector: (value: T) => U,
): U {
  return useSyncExternalStore(
    (onStoreChange) => store.subscribe(() => onStoreChange()),
    () => selector(store.get()),
  );
}
