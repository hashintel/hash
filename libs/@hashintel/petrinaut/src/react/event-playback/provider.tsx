/**
 * @layerRoot react.event-playback
 * @role Drives the viewed time over an event-driven run and asks the worker to compute ahead of it
 */

import { use, useEffect, useState } from "react";

import {
  createEventPlayback,
  EVENT_PLAY_MODE_LEAD,
  PETRINAUT_DEFAULT_SEED,
  type EventPlayback,
  type EventTraceSummary,
  type PlaybackSpeed,
  type PlayMode,
  type ReadableStore,
  type SimulationState as CoreSimulationState,
} from "@hashintel/petrinaut-core";

import { useLatest } from "../hooks/use-latest";
import { useStableCallback } from "../hooks/use-stable-callback";
import { SimulationContext } from "../simulation/context";
import { useStore } from "../use-store";
import {
  EventPlaybackContext,
  type EventPlaybackContextValue,
} from "./context";
import { findStepTargetIndex } from "./step-target";

const EMPTY_TRACE: EventTraceSummary = {
  eventCount: 0,
  coveredTime: 0,
  latest: null,
};

const EMPTY_TRACE_STORE: ReadableStore<EventTraceSummary> = {
  get: () => EMPTY_TRACE,
  subscribe: () => () => {},
};

const EMPTY_STATUS_STORE: ReadableStore<CoreSimulationState> = {
  get: () => "Initializing",
  subscribe: () => () => {},
};

type EventPlaybackProviderProps = React.PropsWithChildren<{
  initialSpeed?: PlaybackSpeed;
}>;

/**
 * Mirrors `PlaybackProvider` for the event-driven engine. It is mounted
 * beside it and only does work while the simulation context's engine is
 * event-driven; otherwise it publishes an inert value.
 */
export const EventPlaybackProvider: React.FC<EventPlaybackProviderProps> = ({
  children,
  initialSpeed,
}) => {
  const {
    engine,
    eventSimulation,
    dt,
    state: simulationState,
    initialize,
    run: runSimulation,
    pause: pauseSimulation,
  } = use(SimulationContext);
  const isActive = engine === "event-driven";

  const [playback] = useState<EventPlayback>(() =>
    createEventPlayback(
      initialSpeed === undefined ? {} : { speed: initialSpeed },
    ),
  );
  const snapshot = useStore(playback.state);
  const { playState, time, speed, mode: requestedMode } = snapshot;

  const trace = useStore(eventSimulation?.trace ?? EMPTY_TRACE_STORE);
  const coreStatus = useStore(eventSimulation?.status ?? EMPTY_STATUS_STORE);
  const simulationDone =
    eventSimulation !== null &&
    (coreStatus === "Complete" || coreStatus === "Error");
  const { coveredTime, eventCount } = trace;

  // Compute modes need a run that can still compute; view-only needs a trace.
  const isComputeAvailable = !simulationDone;
  const isViewOnlyAvailable = eventCount > 0;
  const mode: PlayMode = !isComputeAvailable
    ? "viewOnly"
    : requestedMode === "viewOnly" && eventCount === 0
      ? "computeBuffer"
      : requestedMode;

  const simulationDoneRef = useLatest(simulationDone);
  const coveredTimeRef = useLatest(coveredTime);
  const snapshotRef = useLatest(snapshot);
  const eventSimulationRef = useLatest(eventSimulation);
  const modeRef = useLatest(mode);

  // The run computes ahead of the viewed time by the mode's lead, and not at
  // all in view-only mode. Re-issued as the viewed time moves, since a
  // demand only ever raises the worker's target.
  useEffect(() => {
    if (!isActive || !eventSimulation || mode === "viewOnly") {
      return;
    }
    eventSimulation.demand(time + EVENT_PLAY_MODE_LEAD[mode]);
  }, [eventSimulation, isActive, mode, time]);

  // Discarding the run returns playback to the start. A run is only ever
  // replaced through a discard, so this also covers a new run; starting one
  // from no run keeps the play the user just pressed.
  useEffect(() => {
    if (eventSimulation === null) {
      playback.stop();
    }
  }, [eventSimulation, playback]);

  // The rAF loop while playing: advance the viewed time by wall-clock time.
  useEffect(() => {
    if (!isActive || playState !== "Playing") {
      return;
    }
    let frame: number | null = null;
    const loop = (now: number) => {
      playback.tick({
        currentTime: now,
        coveredTime: coveredTimeRef.current,
        simulationDone: simulationDoneRef.current,
      });
      if (snapshotRef.current.playState === "Playing") {
        frame = requestAnimationFrame(loop);
      }
    };
    playback.resetTiming();
    frame = requestAnimationFrame(loop);
    return () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
    };
  }, [
    coveredTimeRef,
    isActive,
    playState,
    playback,
    simulationDoneRef,
    snapshotRef,
  ]);

  const currentEventIndex = eventSimulation?.findEventIndexAt(time) ?? -1;
  const hasPreviousEvent =
    eventSimulation !== null &&
    findStepTargetIndex(eventSimulation, time, -1) !== null;
  const hasNextEvent =
    eventSimulation !== null &&
    findStepTargetIndex(eventSimulation, time, 1) !== null;
  const currentFrameReader = eventSimulation?.getStateAt(time) ?? null;

  const setTime = (next: number) => {
    playback.setTime(next, coveredTimeRef.current);
  };

  const stepToEvent = (direction: -1 | 1) => {
    const simulation = eventSimulationRef.current;
    if (!simulation) {
      return;
    }
    const targetIndex = findStepTargetIndex(
      simulation,
      snapshotRef.current.time,
      direction,
    );
    const target =
      targetIndex === null ? null : simulation.getEvent(targetIndex);
    if (target) {
      playback.setTime(target.time, coveredTimeRef.current);
    }
  };

  const play = async () => {
    if (simulationState === "NotRun") {
      await initialize({ seed: PETRINAUT_DEFAULT_SEED, dt });
      runSimulation();
      playback.play();
      return;
    }
    if (modeRef.current !== "viewOnly") {
      runSimulation();
    }
    // At the end of a finished run, play again from the start.
    if (
      simulationDoneRef.current &&
      snapshotRef.current.time >= coveredTimeRef.current
    ) {
      playback.setTime(0, coveredTimeRef.current);
    }
    playback.play();
  };

  const pause = () => {
    if (modeRef.current !== "viewOnly") {
      pauseSimulation();
    }
    playback.pause();
  };

  const stop = () => {
    if (modeRef.current !== "viewOnly") {
      pauseSimulation();
    }
    playback.stop();
  };

  const setPlayMode = (next: PlayMode) => {
    if (next === "viewOnly" && !isViewOnlyAvailable) {
      return;
    }
    if (next !== "viewOnly" && !isComputeAvailable) {
      return;
    }
    if (next === "viewOnly") {
      pauseSimulation();
    } else if (snapshotRef.current.playState === "Playing") {
      runSimulation();
    }
    playback.setMode(next);
  };

  const value: EventPlaybackContextValue = {
    time,
    coveredTime,
    eventCount,
    currentEventIndex,
    hasPreviousEvent,
    hasNextEvent,
    currentFrameReader,
    playbackState: playState,
    playbackSpeed: speed,
    playMode: mode,
    isViewOnlyAvailable,
    isComputeAvailable,
    setTime: useStableCallback(setTime),
    stepToEvent: useStableCallback(stepToEvent),
    play: useStableCallback(play),
    pause: useStableCallback(pause),
    stop: useStableCallback(stop),
    setPlaybackSpeed: useStableCallback((next: PlaybackSpeed) =>
      playback.setSpeed(next),
    ),
    setPlayMode: useStableCallback(setPlayMode),
  };

  return <EventPlaybackContext value={value}>{children}</EventPlaybackContext>;
};
