import { createContext, use, useSyncExternalStore } from "react";

import type { SimulationFrameReader } from "../../../react/simulation/context";

export type TransitionFrameState = NonNullable<
  ReturnType<SimulationFrameReader["getTransitionState"]>
>;

export type CanvasFrameStore = {
  subscribe: (listener: () => void) => () => void;
  /**
   * What a place's badge reads, or null for no badge: its token count, or
   * in a Stochastic simulation the mean across runs and its spread.
   */
  getTokenLabel: (placeId: string) => string | null;
  /** A transition's state in the viewed frame, or null when no run exists. */
  getTransitionFrame: (transitionId: string) => TransitionFrameState | null;
};

const EMPTY_STORE: CanvasFrameStore = {
  subscribe: () => () => {},
  getTokenLabel: () => null,
  getTransitionFrame: () => null,
};

export const CanvasFrameStoreContext =
  createContext<CanvasFrameStore>(EMPTY_STORE);

/** What one place's badge reads, without re-rendering the canvas. */
export const usePlaceTokenLabel = (placeId: string): string | null => {
  const store = use(CanvasFrameStoreContext);
  return useSyncExternalStore(
    store.subscribe,
    () => store.getTokenLabel(placeId),
    () => null,
  );
};

/** One transition's frame state, without re-rendering the canvas. */
export const useTransitionFrame = (
  transitionId: string,
): TransitionFrameState | null => {
  const store = use(CanvasFrameStoreContext);
  return useSyncExternalStore(
    store.subscribe,
    () => store.getTransitionFrame(transitionId),
    () => null,
  );
};
