/**
 * @layerRoot react.event-playback
 * @role Drives the one player over the viewed execution, and starts or pauses a simulation with it
 */

import { use, useEffect, useRef, useState } from "react";

import {
  createTracePlayer,
  effectivePlayMode,
  PETRINAUT_DEFAULT_SEED,
  type PlaybackSpeed,
  type PlayMode,
  type TraceCoverage,
  type TracePlayer,
} from "@hashintel/petrinaut-core";

import { ExecutionTraceContext } from "../execution-trace/context";
import { useLatest } from "../shared/use-latest";
import { useStableCallback } from "../shared/use-stable-callback";
import { constantStore, useStore, useStoreSelector } from "../shared/use-store";
import { SimulationContext } from "../simulation/context";
import {
  EventPlaybackContext,
  type EventPlaybackContextValue,
} from "./context";

const NO_COVERAGE_STORE = constantStore<TraceCoverage>({
  eventCount: 0,
  startTime: 0,
  coveredTime: 0,
  ended: false,
});

type EventPlaybackProviderProps = React.PropsWithChildren<{
  initialSpeed?: PlaybackSpeed;
}>;

/**
 * Plays the viewed execution on the one player: loads its trace, ticks the
 * player by the wall clock, and tells a simulation to compute or to hold
 * when playback starts or stops. An execution the host reports is only
 * viewed: nothing here starts or pauses it.
 */
export const EventPlaybackProvider: React.FC<EventPlaybackProviderProps> = ({
  children,
  initialSpeed,
}) => {
  const {
    state: simulationState,
    initialize,
    run: runSimulation,
    pause: pauseSimulation,
  } = use(SimulationContext);
  const { origin, playable } = use(ExecutionTraceContext);
  const [player] = useState<TracePlayer>(() =>
    createTracePlayer(
      initialSpeed === undefined ? {} : { speed: initialSpeed },
    ),
  );
  // The viewed position stays in the store: subscribing to it here would
  // render this provider, and through it every consumer, on every frame.
  const playState = useStoreSelector(
    player.state,
    (snapshot) => snapshot.playState,
  );
  const speed = useStoreSelector(player.state, (snapshot) => snapshot.speed);
  const requestedMode = useStoreSelector(
    player.state,
    (snapshot) => snapshot.mode,
  );

  const coverage = useStore(playable?.coverage ?? NO_COVERAGE_STORE);
  const { startTime, coveredTime, eventCount } = coverage;
  const computes = origin === "simulation";

  // Compute modes need a simulation that can still compute; view-only needs
  // a trace.
  const isComputeAvailable = computes && !coverage.ended;
  const isViewOnlyAvailable = eventCount > 0;
  const mode: PlayMode = computes
    ? effectivePlayMode(requestedMode, coverage)
    : "viewOnly";

  const modeRef = useLatest(mode);

  // The player is a store outside React, and loading is how it learns what
  // to play. A discarded run unloads, which returns playback to the start;
  // a run that starts keeps the play the user just pressed. The host's
  // execution happens on its own, so its view opens at the end and follows.
  useEffect(() => {
    player.load(playable, { follow: origin === "host" });
  }, [player, playable, origin]);

  // The rAF loop while playing: the player advances by wall-clock time.
  useEffect(() => {
    if (playState !== "Playing") {
      return;
    }
    let frame: number | null = null;
    const loop = (now: number) => {
      player.tick(now);
      if (player.state.get().playState === "Playing") {
        frame = requestAnimationFrame(loop);
      }
    };
    frame = requestAnimationFrame(loop);
    return () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
    };
  }, [playState, player]);

  /** The start under way, resolving to whether it started a run. */
  const startingRef = useRef<Promise<boolean> | null>(null);

  const startRun = async (): Promise<boolean> => {
    // A change of configuration can overtake the start: there is then no
    // run to play.
    if (await initialize({ seed: PETRINAUT_DEFAULT_SEED })) {
      runSimulation();
      player.play();
      return true;
    }
    return false;
  };

  const play = async () => {
    if (computes && simulationState === "NotRun") {
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
    player.play();
  };

  const pause = () => {
    if (modeRef.current !== "viewOnly") {
      pauseSimulation();
    }
    player.pause();
  };

  const stop = () => {
    if (modeRef.current !== "viewOnly") {
      pauseSimulation();
    }
    player.stop();
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
    } else if (player.state.get().playState === "Playing") {
      runSimulation();
    }
    player.setMode(next);
  };

  const value: EventPlaybackContextValue = {
    startTime,
    coveredTime,
    eventCount,
    playbackStore: player.state,
    playbackState: playState,
    playbackSpeed: speed,
    playMode: mode,
    isViewOnlyAvailable,
    isComputeAvailable,
    setTime: useStableCallback((time: number) => player.seek(time)),
    stepToEvent: useStableCallback((direction: -1 | 1) =>
      player.step(direction),
    ),
    play: useStableCallback(play),
    pause: useStableCallback(pause),
    stop: useStableCallback(stop),
    setPlaybackSpeed: useStableCallback((next: PlaybackSpeed) =>
      player.setSpeed(next),
    ),
    setPlayMode: useStableCallback(setPlayMode),
  };

  return <EventPlaybackContext value={value}>{children}</EventPlaybackContext>;
};
