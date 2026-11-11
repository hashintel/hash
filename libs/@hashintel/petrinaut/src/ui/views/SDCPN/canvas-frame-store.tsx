/**
 * Per-frame values for the canvas, delivered by subscription rather than by
 * rebuilding the scene.
 *
 * A playback frame moves one number per place and one per transition. The
 * values live in a store whose identity never changes: the provider
 * re-renders as frames arrive, its `children` element does not, and an item
 * subscribes to its own value and re-renders only when that value moves.
 */

import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { EventPlaybackContext } from "../../../react/event-playback/context";
import { ExecutionFrameSourceContext } from "../../../react/execution-frame/context";
import { SimulationContext } from "../../../react/simulation/context";
import { EditorContext } from "../../../react/state/editor-context";

import type {
  InitialMarking,
  SimulationFrameReader,
  SimulationFrameState,
} from "../../../react/simulation/context";
import type { TransitionFrameState } from "./renderers/react-flow/react-flow-canvas/react-flow-types";
import type {
  CountStatistics,
  ExperimentReader,
  ReadableStore,
} from "@hashintel/petrinaut-core";

type FrameSnapshot = {
  reader: SimulationFrameReader | null;
  viewedFrame: SimulationFrameState | null;
  initialMarking: InitialMarking;
  simulateMode: boolean;
  /**
   * A Stochastic simulation's experiment and the viewed time, read when a
   * place asks: its badge then shows the count across runs at that time.
   */
  stochastic: {
    reader: ExperimentReader;
    viewedTime: () => number;
  } | null;
};

type CanvasFrameStore = {
  subscribe: (listener: () => void) => () => void;
  /**
   * What a place's badge reads, or null for no badge: its token count, or
   * in a Stochastic simulation the mean across runs and its spread.
   */
  getTokenLabel: (placeId: string) => string | null;
  /** A transition's state in the viewed frame, or null when no run exists. */
  getTransitionFrame: (transitionId: string) => TransitionFrameState | null;
};

/** A mean as a badge prints it: whole when it is, one decimal otherwise. */
const formatMean = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

/** A count across runs as a badge prints it: the mean, and the spread when there is one. */
const formatCountStatistics = ({
  mean,
  standardDeviation,
}: Pick<CountStatistics, "mean" | "standardDeviation">): string =>
  standardDeviation === 0
    ? formatMean(mean)
    : `${formatMean(mean)} ±${standardDeviation.toFixed(1)}`;

/** What the canvas reads, from the values a render of the provider holds. */
const frameSnapshot = ({
  reader,
  viewedFrame,
  initialMarking,
  simulateMode,
  stochasticReader,
  playbackStore,
}: Omit<FrameSnapshot, "stochastic"> & {
  stochasticReader: ExperimentReader | null;
  playbackStore: ReadableStore<{ time: number }>;
}): FrameSnapshot => ({
  reader,
  viewedFrame,
  initialMarking,
  simulateMode,
  stochastic: stochasticReader
    ? {
        reader: stochasticReader,
        viewedTime: () => playbackStore.get().time,
      }
    : null,
});

const notifyAll = (listeners: ReadonlySet<() => void>): void => {
  for (const listener of listeners) {
    listener();
  }
};

const EMPTY_STORE: CanvasFrameStore = {
  subscribe: () => () => {},
  getTokenLabel: () => null,
  getTransitionFrame: () => null,
};

const CanvasFrameStoreContext = createContext<CanvasFrameStore>(EMPTY_STORE);

const sameTransitionState = (
  left: TransitionFrameState | null,
  right: TransitionFrameState | null,
): boolean =>
  left === right ||
  (left !== null && right !== null && left.firingCount === right.firingCount);

/**
 * Reads the frame source and publishes it to the canvas.
 *
 * This component re-renders on every frame; the canvas below it does not,
 * because `children` arrives as an element its own parent already made.
 */
export const CanvasFrameStoreProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const { currentViewedFrame, currentFrameReader } = use(
    ExecutionFrameSourceContext,
  );
  const { initialMarking, stochasticRun } = use(SimulationContext);
  const { playbackStore } = use(EventPlaybackContext);
  const { globalMode } = use(EditorContext);
  const stochasticReader = stochasticRun?.reader ?? null;
  const stochasticExperiment = stochasticRun?.experiment ?? null;

  // Filled on the first render, so the first paint already carries the
  // marking and the viewed frame rather than gaining them a frame later.
  const snapshot = useRef(
    frameSnapshot({
      reader: currentFrameReader,
      viewedFrame: currentViewedFrame,
      initialMarking,
      simulateMode: globalMode === "simulate",
      stochasticReader,
      playbackStore,
    }),
  );
  const listeners = useRef(new Set<() => void>());
  /**
   * Read through on demand, so a frame costs the transitions actually
   * mounted. Each entry is kept while its firing count holds, so a transition
   * that did not fire keeps its value and does not re-render.
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

    getTokenLabel: (placeId) => {
      const {
        viewedFrame,
        simulateMode,
        initialMarking: marking,
        stochastic,
      } = snapshot.current;
      if (stochastic) {
        const statistics = stochastic.reader.placeCountAt(
          placeId,
          stochastic.viewedTime(),
        );
        return statistics ? formatCountStatistics(statistics) : null;
      }
      if (viewedFrame) {
        const count = viewedFrame.places[placeId]?.tokenCount;
        return count === undefined ? null : String(count);
      }
      if (!simulateMode) {
        return null;
      }
      const placeMarking = marking[placeId];
      return String(
        typeof placeMarking === "number"
          ? placeMarking
          : (placeMarking?.length ?? 0),
      );
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
  }));

  // Publishing happens after the commit, so a subscriber re-reads a store the
  // rest of the tree has already seen.
  useEffect(() => {
    snapshot.current = frameSnapshot({
      reader: currentFrameReader,
      viewedFrame: currentViewedFrame,
      initialMarking,
      simulateMode: globalMode === "simulate",
      stochasticReader,
      playbackStore,
    });

    // Re-read each transition that is mounted, and keep the previous value
    // where the transition did not fire, so only what changed re-renders.
    const cache = transitionCache.current;
    for (const [transitionId, previous] of cache) {
      const next = currentFrameReader?.getTransitionState(transitionId) ?? null;
      cache.set(
        transitionId,
        sameTransitionState(previous, next) ? previous : next,
      );
    }

    notifyAll(listeners.current);
  }, [
    currentViewedFrame,
    currentFrameReader,
    initialMarking,
    globalMode,
    playbackStore,
    stochasticReader,
  ]);

  // In a Stochastic simulation a place's badge moves with the viewed time
  // and with the samples as they arrive, neither of which renders this
  // provider: both tell the places directly.
  useEffect(() => {
    if (!stochasticExperiment) {
      return;
    }
    const notify = () => notifyAll(listeners.current);
    const offTime = playbackStore.subscribe(notify);
    const offSamples = stochasticExperiment.metrics.subscribe(notify);
    return () => {
      offTime();
      offSamples();
    };
  }, [playbackStore, stochasticExperiment]);

  return (
    <CanvasFrameStoreContext value={store}>{children}</CanvasFrameStoreContext>
  );
};

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
