/**
 * Minimal observable value contract used by Petrinaut core APIs.
 *
 * Core cannot depend on React or a state-management library, but document
 * handles, simulations, playback, and language services still need to expose
 * live state snapshots to UI adapters and hosts. `ReadableStore` is the shared
 * pull-plus-subscribe shape for that boundary: callers can synchronously read
 * the current value with `get()` and subscribe to future updates without being
 * able to mutate the store directly.
 */
export type ReadableStore<T> = {
  get(): T;
  subscribe(listener: (value: T) => void): () => void;
};

export function createReadableStore<T>(
  initial: T,
): ReadableStore<T> & { set(next: T): void } {
  let current = initial;
  const listeners = new Set<(value: T) => void>();

  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      if (Object.is(next, current)) {
        return;
      }

      current = next;
      for (const listener of listeners) {
        listener(current);
      }
    },
  };
}
