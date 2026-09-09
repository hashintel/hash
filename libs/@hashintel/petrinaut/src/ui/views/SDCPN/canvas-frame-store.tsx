/**
 * Per-frame values for the canvas, delivered by subscription rather than by
 * rebuilding the scene.
 *
 * A playback frame moves one number per place and one per transition. Those
 * used to ride on the React Flow node data, so a frame rebuilt every node and
 * arc and re-rendered the lot to move a handful of numbers. Here the values
 * live in a store whose identity never changes: the provider re-renders as
 * frames arrive, its `children` element does not, and an item subscribes to
 * its own value and re-renders only when that value moves.
 */

import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { ExecutionFrameSourceContext } from "../../../react/execution-frame/context";
import { SimulationContext } from "../../../react/simulation/context";
import { EditorContext } from "../../../react/state/editor-context";

import type {
  InitialMarking,
  SimulationFrameReader,
  SimulationFrameState,
} from "../../../react/simulation/context";
import type { TransitionFrameState } from "./renderers/react-flow/react-flow-canvas/react-flow-types";

type FrameSnapshot = {
  reader: SimulationFrameReader | null;
  viewedFrame: SimulationFrameState | null;
  initialMarking: InitialMarking;
  simulateMode: boolean;
  framesAvailable: boolean;
};

const EMPTY_SNAPSHOT: FrameSnapshot = {
  reader: null,
  viewedFrame: null,
  initialMarking: {},
  simulateMode: false,
  framesAvailable: false,
};

export type CanvasFrameStore = {
  subscribe: (listener: () => void) => () => void;
  /** Tokens to show on a place, or null for no badge. */
  getTokenCount: (placeId: string) => number | null;
  /** A transition's state in the viewed frame, or null when no run exists. */
  getTransitionFrame: (transitionId: string) => TransitionFrameState | null;
  getFramesAvailable: () => boolean;
};

const EMPTY_STORE: CanvasFrameStore = {
  subscribe: () => () => {},
  getTokenCount: () => null,
  getTransitionFrame: () => null,
  getFramesAvailable: () => false,
};

const CanvasFrameStoreContext = createContext<CanvasFrameStore>(EMPTY_STORE);

const sameTransitionState = (
  left: TransitionFrameState | null,
  right: TransitionFrameState | null,
): boolean =>
  left === right ||
  (left !== null &&
    right !== null &&
    left.firingCount === right.firingCount &&
    left.firedInThisFrame === right.firedInThisFrame &&
    left.timeSinceLastFiringMs === right.timeSinceLastFiringMs);

/**
 * Reads the frame source and publishes it to the canvas.
 *
 * This component re-renders on every frame; the canvas below it does not,
 * because `children` arrives as an element its own parent already made.
 */
export const CanvasFrameStoreProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const { currentViewedFrame, currentFrameReader, totalFrames } = use(
    ExecutionFrameSourceContext,
  );
  const { initialMarking } = use(SimulationContext);
  const { globalMode } = use(EditorContext);

  const snapshot = useRef<FrameSnapshot>(EMPTY_SNAPSHOT);
  const listeners = useRef(new Set<() => void>());
  /**
   * Read through on demand, so a frame costs the transitions actually
   * mounted. Each entry is kept while its content holds, so a transition that
   * did not move keeps its value and does not re-render.
   */
  const transitionCache = useRef(
    new Map<string, TransitionFrameState | null>(),
  );

  const [store] = useState<CanvasFrameStore>(() => ({
    subscribe: (listener) => {
      listeners.current.add(listener);
      return () => {
        listeners.current.delete(listener);
      };
    },

    getTokenCount: (placeId) => {
      const {
        viewedFrame,
        simulateMode,
        initialMarking: marking,
      } = snapshot.current;
      if (viewedFrame) {
        return viewedFrame.places[placeId]?.tokenCount ?? null;
      }
      if (!simulateMode) {
        return null;
      }
      const placeMarking = marking[placeId];
      return typeof placeMarking === "number"
        ? placeMarking
        : (placeMarking?.length ?? 0);
    },

    getTransitionFrame: (transitionId) => {
      const cache = transitionCache.current;
      if (cache.has(transitionId)) {
        return cache.get(transitionId) ?? null;
      }
      const state =
        snapshot.current.reader?.getTransitionState(transitionId) ?? null;
      cache.set(transitionId, state);
      return state;
    },

    getFramesAvailable: () => snapshot.current.framesAvailable,
  }));

  // Publishing happens after the commit, so a subscriber re-reads a store the
  // rest of the tree has already seen.
  useEffect(() => {
    snapshot.current = {
      reader: currentFrameReader,
      viewedFrame: currentViewedFrame,
      initialMarking,
      simulateMode: globalMode === "simulate",
      framesAvailable: totalFrames > 0,
    };

    // Re-read each transition that is mounted, and keep the previous value
    // where the transition did not move, so only what changed re-renders.
    const cache = transitionCache.current;
    for (const [transitionId, previous] of cache) {
      const next = currentFrameReader?.getTransitionState(transitionId) ?? null;
      cache.set(
        transitionId,
        sameTransitionState(previous, next) ? previous : next,
      );
    }

    for (const listener of listeners.current) {
      listener();
    }
  }, [
    currentViewedFrame,
    currentFrameReader,
    totalFrames,
    initialMarking,
    globalMode,
  ]);

  return (
    <CanvasFrameStoreContext value={store}>{children}</CanvasFrameStoreContext>
  );
};

/** The tokens to show on one place, without re-rendering the canvas. */
export const usePlaceTokenCount = (placeId: string): number | null => {
  const store = use(CanvasFrameStoreContext);
  return useSyncExternalStore(
    store.subscribe,
    () => store.getTokenCount(placeId),
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

/** Whether any frame exists to visualize. */
export const useFramesAvailable = (): boolean => {
  const store = use(CanvasFrameStoreContext);
  return useSyncExternalStore(
    store.subscribe,
    store.getFramesAvailable,
    () => false,
  );
};
