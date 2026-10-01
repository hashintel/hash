import { useSyncExternalStore } from "react";

/** The controllers whose lever rows show in the Entities list. All start collapsed. */
let expanded: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

export const toggleControllerExpanded = (controllerId: string): void => {
  const next = new Set(expanded);
  if (!next.delete(controllerId)) {
    next.add(controllerId);
  }
  expanded = next;
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

export const useExpandedControllers = (): ReadonlySet<string> =>
  useSyncExternalStore(
    subscribe,
    () => expanded,
    () => expanded,
  );
