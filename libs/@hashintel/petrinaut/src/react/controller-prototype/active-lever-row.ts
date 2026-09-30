import { useSyncExternalStore } from "react";

/** The lever row the user last clicked in the Entities list, and the node it selected. */
export type ActiveLeverRow = { rowId: string; nodeId: string } | null;

let active: ActiveLeverRow = null;
const listeners = new Set<() => void>();

export const setActiveLeverRow = (next: ActiveLeverRow): void => {
  active = next;
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

export const useActiveLeverRow = (): ActiveLeverRow =>
  useSyncExternalStore(
    subscribe,
    () => active,
    () => null,
  );
