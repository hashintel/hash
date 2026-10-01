import { useSyncExternalStore } from "react";

let enabled = true;
const listeners = new Set<() => void>();

/** Whether Transition Results offers the Fields | Code switch. On by default. */
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
    () => true,
  );
