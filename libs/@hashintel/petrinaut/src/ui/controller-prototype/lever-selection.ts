import { useSyncExternalStore } from "react";

/**
 * The Rate lever clicked in the controller panel. The panel owns it; the
 * sidebar and the canvas read it to soft-highlight the lever's rivals.
 */
export type LeverSelection = { controllerId: string; leverId: string };

let selected: LeverSelection | null = null;
const listeners = new Set<() => void>();

export const setLeverSelection = (next: LeverSelection | null): void => {
  if (
    selected?.controllerId === next?.controllerId &&
    selected?.leverId === next?.leverId
  ) {
    return;
  }
  selected = next;
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

export const useLeverSelection = (): LeverSelection | null =>
  useSyncExternalStore(
    subscribe,
    () => selected,
    () => null,
  );
