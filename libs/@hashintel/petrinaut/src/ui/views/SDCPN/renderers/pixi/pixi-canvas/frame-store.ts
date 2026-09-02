/**
 * The simulation state the Pixi renderer animates from, as an external store.
 * One component reads the React contexts and writes here, so a playback frame
 * reaches the animator through a subscription instead of re-rendering every
 * node.
 */

import { use, useEffect, useSyncExternalStore, type FC } from "react";

import { ExecutionFrameSourceContext } from "../../../../../../react/execution-frame/context";
import { SimulationContext } from "../../../../../../react/simulation/context";
import { EditorContext } from "../../../../../../react/state/editor-context";

import type { SimulationFrameReader } from "../../../../../../react/simulation/context";

export type FrameSnapshot = {
  frameReader: SimulationFrameReader | null;
  /** Token count shown on a place's badge, or null to show no badge. */
  tokenCountOf: (placeId: string) => number | null;
  /** Whether any frames exist, which enables the place state tooltip. */
  hasFrames: boolean;
};

export type FrameStore = {
  get: () => FrameSnapshot;
  set: (snapshot: FrameSnapshot) => void;
  subscribe: (listener: () => void) => () => void;
};

const emptySnapshot: FrameSnapshot = {
  frameReader: null,
  tokenCountOf: () => null,
  hasFrames: false,
};

export const createFrameStore = (): FrameStore => {
  let snapshot = emptySnapshot;
  const listeners = new Set<() => void>();
  return {
    get: () => snapshot,
    set: (next) => {
      snapshot = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export const useFrameSnapshot = (store: FrameStore): FrameSnapshot =>
  useSyncExternalStore(store.subscribe, store.get, store.get);

/**
 * Mirrors the execution frame and simulation contexts into the store. Token
 * counts follow the viewed frame, or the initial marking while in simulate
 * mode before a run, matching the React Flow nodes.
 */
export const FrameBridge: FC<{ store: FrameStore }> = ({ store }) => {
  const { currentFrameReader, currentViewedFrame, totalFrames } = use(
    ExecutionFrameSourceContext,
  );
  const { initialMarking } = use(SimulationContext);
  const { globalMode } = use(EditorContext);
  const isSimulateMode = globalMode === "simulate";

  useEffect(() => {
    store.set({
      frameReader: currentFrameReader,
      hasFrames: totalFrames > 0,
      tokenCountOf: (placeId) => {
        if (currentViewedFrame) {
          return currentViewedFrame.places[placeId]?.tokenCount ?? null;
        }
        if (isSimulateMode) {
          const marking = initialMarking[placeId];
          return typeof marking === "number" ? marking : (marking?.length ?? 0);
        }
        return null;
      },
    });
  }, [
    store,
    currentFrameReader,
    currentViewedFrame,
    totalFrames,
    initialMarking,
    isSimulateMode,
  ]);

  return null;
};
