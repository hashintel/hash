import { use } from "react";

import { findStepTargetIndex } from "@hashintel/petrinaut-core";

import { ExecutionTraceContext } from "../execution-trace/context";
import { useStoreSelector } from "../shared/use-store";
import { EventPlaybackContext } from "./context";

import type { SimulationFrameReader } from "../simulation/context";

/** The viewed execution as seen at the viewed position: what changes at frame rate. */
type EventPlaybackFrame = {
  /** The viewed position, in seconds or in steps. */
  time: number;
  /** Index of the last event at or before the viewed position, or -1 before the first. */
  currentEventIndex: number;
  /** The state at the viewed position, interpolated between events. */
  currentFrameReader: SimulationFrameReader | null;
  /** True when a firing or the initial state lies before the viewed position. */
  hasPreviousEvent: boolean;
  /** True when a firing lies after the viewed position. */
  hasNextEvent: boolean;
};

/**
 * Subscribes the calling component to the viewed position and derives the
 * frame from it. Only a component that shows the position, or the state at
 * it, should call this: it re-renders on every animation frame while
 * playing.
 */
export const useEventPlaybackFrame = (): EventPlaybackFrame => {
  const { trace } = use(ExecutionTraceContext);
  const { playbackStore, eventCount } = use(EventPlaybackContext);
  const time = useStoreSelector(playbackStore, (snapshot) => snapshot.time);
  // The trace grows in place, so its event count is the version of what it
  // holds: a count that changed means there may be more to step to.
  const stepTarget = (direction: -1 | 1) =>
    trace !== null && eventCount > 0
      ? findStepTargetIndex(trace, time, direction)
      : null;

  return {
    time,
    currentEventIndex: trace?.findEventIndexAt(time) ?? -1,
    currentFrameReader: trace?.getStateAt(time) ?? null,
    hasPreviousEvent: stepTarget(-1) !== null,
    hasNextEvent: stepTarget(1) !== null,
  };
};
