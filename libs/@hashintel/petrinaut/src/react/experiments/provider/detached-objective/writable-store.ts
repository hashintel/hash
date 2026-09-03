import type { ReadableStore } from "@hashintel/petrinaut-core";

export type WritableStore<T> = ReadableStore<T> & {
  set(this: void, value: T): void;
};

/** A readable store with a setter. Setting an identical value notifies nobody. */
export const createWritableStore = <T>(initial: T): WritableStore<T> => {
  let current = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get: () => current,
    set: (value) => {
      if (Object.is(current, value)) {
        return;
      }
      current = value;
      for (const listener of listeners) {
        listener(value);
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
