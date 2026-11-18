/**
 * @layerRoot react.event-playback
 * @role Drives the viewed time over a run or an experiment and asks the worker to compute ahead of it
 */

import { use, useEffect, useRef, useState } from "react";

import {
  createEventPlayback,
  EVENT_PLAY_MODE_LEAD,
  PETRINAUT_DEFAULT_SEED,
  type EventPlayback,
  type EventTraceSummary,
  type PlaybackSpeed,
  type PlayMode,
  type SimulationState as CoreSimulationState,
} from "@hashintel/petrinaut-core";

import { useLatest } from "../hooks/use-latest";
import { useStableCallback } from "../hooks/use-stable-callback";
import { SimulationContext } from "../simulation/context";
import { constantStore, useStore, useStoreSelector } from "../use-store";
import {
  EventPlaybackContext,
  type EventPlaybackContextValue,
} from "./context";
import { findRestingTime } from "./resting-time";
import { findStepTargetIndex } from "./step-target";

/** Simulated seconds the demand must move by before the worker hears of it. */
const DEMAND_STEP = 1 / 60;

const EMPTY_TRACE: EventTraceSummary = {
  eventCount: 0,
  coveredTime: 0,
  latest: null,
};

const EMPTY_TRACE_STORE = constantStore(EMPTY_TRACE);
const EMPTY_STATUS_STORE = constantStore<CoreSimulationState>("Initializing");

type EventPlaybackProviderProps = React.PropsWithChildren<{
  initialSpeed?: PlaybackSpeed;
}>;

/**
 * Plays what the simulation context holds: moves the viewed time by the
 * wall clock, and names to the run the time it should compute up to.
 */
export const EventPlaybackProvider: React.FC<EventPlaybackProviderProps> = ({
  children,
  initialSpeed,
}) => {
  const {
    eventSimulation,
    playbackSource,
    state: simulationState,
    initialize,
    run: runSimulation,
    pause: pauseSimulation,
  } = use(SimulationContext);
  const [playback] = useState<EventPlayback>(() =>
    createEventPlayback(
      initialSpeed === undefined ? {} : { speed: initialSpeed },
    ),
  );
  // The viewed time stays in the store: subscribing to it here would render
  // this provider, and through it every consumer, on every frame.
  const playState = useStoreSelector(
    playback.state,
    (snapshot) => snapshot.playState,
  );
  const speed = useStoreSelector(playback.state, (snapshot) => snapshot.speed);
  const requestedMode = useStoreSelector(
    playback.state,
    (snapshot) => snapshot.mode,
  );

  const trace = useStore(playbackSource?.coverage ?? EMPTY_TRACE_STORE);
  const coreStatus = useStore(playbackSource?.status ?? EMPTY_STATUS_STORE);
  const simulationDone =
    playbackSource !== null &&
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
  const eventSimulationRef = useLatest(eventSimulation);
  const modeRef = useLatest(mode);

  // The run computes ahead of the viewed time by the mode's lead, and not at
  // all in view-only mode. Re-issued as the viewed time moves forward; a
  // demand that moved by less than a frame's worth of simulated time is not
  // worth a message. A change of mode demands afresh, which is what takes
  // the worker's target back down from the max mode's.
  useEffect(() => {
    if (!playbackSource || mode === "viewOnly") {
      return;
    }
    const lead = EVENT_PLAY_MODE_LEAD[mode];
    let demanded = Number.NEGATIVE_INFINITY;
    const demand = (snapshot: { time: number }) => {
      const target = snapshot.time + lead;
      if (target >= demanded + DEMAND_STEP) {
        demanded = target;
        playbackSource.demand(target);
      }
    };
    demand(playback.state.get());
    return playback.state.subscribe(demand);
  }, [mode, playback, playbackSource]);

  // Discarding the run returns playback to the start. A run is only ever
  // replaced through a discard, so this also covers a new run; starting one
  // from no run keeps the play the user just pressed.
  useEffect(() => {
    if (playbackSource === null) {
      playback.stop();
    }
  }, [playback, playbackSource]);

  // The rAF loop while playing: advance the viewed time by wall-clock time.
  useEffect(() => {
    if (playState !== "Playing") {
      return;
    }
    let frame: number | null = null;
    const loop = (now: number) => {
      playback.tick({
        currentTime: now,
        coveredTime: coveredTimeRef.current,
        simulationDone: simulationDoneRef.current,
      });
      if (playback.state.get().playState === "Playing") {
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
  }, [coveredTimeRef, playState, playback, simulationDoneRef]);

  // A discrete run is viewed at its events: a view put between two of them
  // rests on the earlier one. Playing still moves the viewed time through
  // the time between them, which is what paces a timed run.
  const setTime = (next: number) => {
    const covered = coveredTimeRef.current;
    const simulation = eventSimulationRef.current;
    const time = Math.max(0, Math.min(next, covered));
    playback.setTime(
      simulation ? findRestingTime(simulation, time) : time,
      covered,
    );
  };

  const stepToEvent = (direction: -1 | 1) => {
    const simulation = eventSimulationRef.current;
    if (!simulation) {
      return;
    }
    const targetIndex = findStepTargetIndex(
      simulation,
      playback.state.get().time,
      direction,
    );
    const target =
      targetIndex === null ? null : simulation.getEvent(targetIndex);
    if (target) {
      playback.setTime(target.time, coveredTimeRef.current);
    }
  };

  /** The start under way, resolving to whether it started a run. */
  const startingRef = useRef<Promise<boolean> | null>(null);

  const startRun = async (): Promise<boolean> => {
    // A change of configuration can overtake the start: there is then no
    // run to play.
    if (await initialize({ seed: PETRINAUT_DEFAULT_SEED })) {
      runSimulation();
      playback.play();
      return true;
    }
    return false;
  };

  const play = async () => {
    if (simulationState === "NotRun") {
      // Play pressed again while a start is under way joins it: a second
      // start would supersede the first and compile the net again. A start
      // that was overtaken started nothing, so the press then starts the
      // run itself, unless another press already has. One that failed has
      // reported why.
      let joined = startingRef.current;
      while (joined) {
        if (await joined.catch(() => true)) {
          return;
        }
        joined = startingRef.current;
      }
      const starting = startRun();
      startingRef.current = starting;
      // `.finally` rather than `try`/`finally`, which React Compiler does
      // not compile without a `catch`.
      await starting.finally(() => {
        if (startingRef.current === starting) {
          startingRef.current = null;
        }
      });
      return;
    }
    if (modeRef.current !== "viewOnly") {
      runSimulation();
    }
    // At the end of a finished run, play again from the start.
    if (
      simulationDoneRef.current &&
      playback.state.get().time >= coveredTimeRef.current
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
    // Pausing a discrete run rests the view on the event it last passed.
    setTime(playback.state.get().time);
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
    } else if (playback.state.get().playState === "Playing") {
      runSimulation();
    }
    playback.setMode(next);
  };

  const value: EventPlaybackContextValue = {
    coveredTime,
    eventCount,
    playbackStore: playback.state,
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
