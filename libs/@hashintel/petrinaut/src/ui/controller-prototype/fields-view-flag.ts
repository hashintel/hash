import { useSyncExternalStore } from "react";

let enabled = false;
const listeners = new Set<() => void>();

/** Whether Transition Results offers the Fields | Code switch. Set by the prototype page; off by default. */
export const setFieldsView = (next: boolean): void => {
  enabled = next;
  for (const listener of listeners) {
    listener();
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useFieldsView = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => enabled,
    () => false,
  );
