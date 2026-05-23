export type ValueStore<T> = {
  getSnapshot: () => T;
  set: (next: T) => void;
  subscribe: (listener: () => void) => () => void;
};

export const createValueStore = <T>(initial: T): ValueStore<T> => {
  let current = initial;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => current,
    set(next) {
      if (Object.is(current, next)) {
        return;
      }
      current = next;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
