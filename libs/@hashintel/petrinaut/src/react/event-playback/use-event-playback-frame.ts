import { use } from "react";

import { useStoreSelector } from "../shared/use-store";
import { SimulationContext } from "../simulation/context";
import { EventPlaybackContext } from "./context";
import { findStepTargetIndex } from "./step-target";

import type { SimulationFrameReader } from "../simulation/context";

/** The run as seen at the viewed time: what changes at frame rate. */
type EventPlaybackFrame = {
  /** The viewed simulation time, in seconds. */
  time: number;
  /** Index of the last event at or before the viewed time, or -1 before the first. */
  currentEventIndex: number;
  /** The state at the viewed time, interpolated between events. */
  currentFrameReader: SimulationFrameReader | null;
  /** True when a firing or the initial state lies before the viewed time. */
  hasPreviousEvent: boolean;
  /** True when a firing lies after the viewed time. */
  hasNextEvent: boolean;
};

/**
 * Subscribes the calling component to the viewed time and derives the frame
 * from it. Only a component that shows the time, or the state at it, should
 * call this: it re-renders on every animation frame while playing.
 */
export const useEventPlaybackFrame = (): EventPlaybackFrame => {
  const { eventSimulation } = use(SimulationContext);
  const { playbackStore, eventCount } = use(EventPlaybackContext);
  const time = useStoreSelector(playbackStore, (snapshot) => snapshot.time);
  // The run grows in place, so its event count is the version of what it
  // holds: a count that changed means there may be more to step to.
  const stepTarget = (direction: -1 | 1) =>
    eventSimulation !== null && eventCount > 0
      ? findStepTargetIndex(eventSimulation, time, direction)
      : null;

  return {
    time,
    currentEventIndex: eventSimulation?.findEventIndexAt(time) ?? -1,
    currentFrameReader: eventSimulation?.getStateAt(time) ?? null,
    hasPreviousEvent: stepTarget(-1) !== null,
    hasNextEvent: stepTarget(1) !== null,
  };
};
