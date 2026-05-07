import { use, useEffect, useRef, useState } from "react";

import type { ReadableStore } from "../../core/handle";
import {
  createPlayback,
  getPlayModeBackpressure,
  type Playback,
  type PlaybackSnapshot,
  type PlaybackSpeed,
  type PlayMode,
} from "../../core/playback";
import { useLatest } from "../hooks/use-latest";
import { useStableCallback } from "../hooks/use-stable-callback";
import {
  SimulationContext,
  type SimulationFrame,
  type SimulationFrameState,
} from "../simulation/context";
import { useStore } from "../use-store";
import { PlaybackContext, type PlaybackContextValue } from "./context";

/**
 * Stable fallback snapshot used while the real playback handle is being
 * created in the mount effect. Sharing the same reference across `get()` calls
 * keeps `useSyncExternalStore` from looping (a fresh object each read would
 * trigger an infinite render cycle).
 */
const EMPTY_PLAYBACK_SNAPSHOT: PlaybackSnapshot = {
  playState: "Stopped",
  frameIndex: 0,
  speed: 1,
  mode: "computeMax",
};

const EMPTY_PLAYBACK_STORE: ReadableStore<PlaybackSnapshot> = {
  get: () => EMPTY_PLAYBACK_SNAPSHOT,
  subscribe: () => () => {},
};

/**
 * Converts a {@link SimulationFrame} to the simplified {@link SimulationFrameState}
 * shape consumed by visualisations.
 */
function buildFrameState(
  frame: SimulationFrame | null,
  frameIndex: number,
): SimulationFrameState | null {
  if (!frame) {
    return null;
  }

  const places: SimulationFrameState["places"] = {};
  for (const [placeId, placeData] of Object.entries(frame.places)) {
    places[placeId] = { tokenCount: placeData.count };
  }

  const transitions: SimulationFrameState["transitions"] = {};
  for (const [transitionId, transitionData] of Object.entries(
    frame.transitions,
  )) {
    transitions[transitionId] = {
      timeSinceLastFiringMs: transitionData.timeSinceLastFiringMs,
      firedInThisFrame: transitionData.firedInThisFrame,
      firingCount: transitionData.firingCount,
    };
  }

  return {
    number: frameIndex,
    time: frame.time,
    places,
    transitions,
  };
}

type PlaybackProviderProps = React.PropsWithChildren;

export const PlaybackProvider: React.FC<PlaybackProviderProps> = ({
  children,
}) => {
  const {
    dt,
    state: simulationState,
    totalFrames,
    getFrame,
    initialize,
    run: runSimulation,
    pause: pauseSimulation,
    setBackpressure,
    ack,
  } = use(SimulationContext);

  // Pure timing model lives in /core. The provider drives ticks via rAF and
  // coordinates simulation lifecycle (init / run / pause / ack / backpressure).
  //
  // Created inside an effect (not via `useState`'s lazy initializer) so React
  // StrictMode's simulated unmount/remount doesn't leave us holding a disposed
  // handle. The cleanup disposes whichever handle was created here; the next
  // mount creates a fresh one. Same pattern as <LanguageClientProvider>.
  const [playback, setPlayback] = useState<Playback | null>(null);
  useEffect(() => {
    const pb = createPlayback();
    setPlayback(pb);
    return () => {
      pb.dispose();
      setPlayback((current) => (current === pb ? null : current));
    };
  }, []);

  const snapshot = useStore(playback?.state ?? EMPTY_PLAYBACK_STORE);
  const { playState, frameIndex, speed, mode } = snapshot;

  // Currently displayed frame data, fetched from the simulation when the
  // index changes.
  const [currentFrame, setCurrentFrame] = useState<SimulationFrame | null>(
    null,
  );

  // Refs for stable identities inside the rAF loop / callbacks.
  const dtRef = useLatest(dt);
  const simulationStateRef = useLatest(simulationState);
  const totalFramesRef = useLatest(totalFrames);
  const snapshotRef = useLatest(snapshot);

  // viewOnly mode is available when there are computed frames to view.
  const isViewOnlyAvailable = totalFrames > 0;

  // Compute modes are available when simulation can still compute more frames.
  const isComputeAvailable =
    simulationState !== "Complete" && simulationState !== "Error";

  // Fetch frame whenever the index changes.
  useEffect(() => {
    let cancelled = false;
    void getFrame(frameIndex).then((frame) => {
      if (!cancelled) {
        setCurrentFrame(frame);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [frameIndex, getFrame, totalFrames]);

  // Auto-switch to viewOnly when the simulation can no longer compute.
  useEffect(() => {
    if (!playback) {
      return;
    }
    if (!isComputeAvailable && mode !== "viewOnly") {
      playback.setMode("viewOnly");
    }
  }, [isComputeAvailable, mode, playback]);

  // Push backpressure config to the simulation worker on mode changes.
  useEffect(() => {
    const cfg = getPlayModeBackpressure(mode);
    setBackpressure(cfg);
  }, [mode, setBackpressure]);

  // Reset playback state when the simulation is reset / not yet run.
  useEffect(() => {
    if (!playback) {
      return;
    }
    if (simulationState === "NotRun") {
      playback.stop();
    }
  }, [simulationState, playback]);

  // Safety net: if the simulation transitions into Running without going
  // through `play()` (e.g. an external caller invoked `simulation.run()`
  // directly), make sure playback follows. The user-driven play path calls
  // `playback.play()` itself so this effect is normally a no-op.
  const prevSimulationStateRef = useRef(simulationState);
  useEffect(() => {
    const prevState = prevSimulationStateRef.current;
    prevSimulationStateRef.current = simulationState;
    if (!playback) {
      return;
    }
    if (simulationState === "Running" && prevState !== "Running") {
      playback.play();
    }
  }, [simulationState, playback]);

  // Backpressure ack — based on play mode.
  const prevTotalFramesRef = useRef(totalFrames);
  useEffect(() => {
    const prevFrames = prevTotalFramesRef.current;
    prevTotalFramesRef.current = totalFrames;

    if (totalFrames === 0) {
      return;
    }

    if (mode === "viewOnly") {
      return;
    }

    if (mode === "computeMax") {
      if (totalFrames === prevFrames) {
        return;
      }
      ack(totalFrames - 1);
      return;
    }

    // computeBuffer: ack when within bufferFrames of the end.
    const bufferDurationInSeconds = 0.5;
    const bufferFrames = Math.ceil(bufferDurationInSeconds / dt);
    if (frameIndex >= totalFrames - bufferFrames) {
      ack(totalFrames - 1);
    }
  }, [totalFrames, mode, frameIndex, dt, ack]);

  // rAF loop — drive playback ticks while Playing.
  useEffect(() => {
    if (!playback || playState !== "Playing") {
      return;
    }

    let raf: number | null = null;
    const loop = (currentTime: number) => {
      const simState = simulationStateRef.current;
      const simulationDone = simState === "Complete" || simState === "Error";

      playback.tick({
        currentTime,
        dt: dtRef.current,
        totalFrames: totalFramesRef.current,
        simulationDone,
      });

      // Re-check after tick — playback.tick may have transitioned to Paused.
      if (snapshotRef.current.playState === "Playing") {
        raf = requestAnimationFrame(loop);
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      if (raf !== null) {
        cancelAnimationFrame(raf);
      }
    };
  }, [
    playState,
    playback,
    dtRef,
    simulationStateRef,
    totalFramesRef,
    snapshotRef,
  ]);

  //
  // Actions
  //

  // Simulation control is gated only on `mode` (not on the React-mirrored
  // simulation state). The simulation handle's `pause`/`run` are idempotent at
  // the worker level, and the React-mirrored state lags behind worker reality
  // — gating on it caused the "first pause doesn't pause sim generation"
  // class of bug where simState was momentarily out of sync with the worker.

  const setCurrentViewedFrame: PlaybackContextValue["setCurrentViewedFrame"] = (
    index,
  ) => {
    playback?.setFrameIndex(index, totalFramesRef.current);
  };

  const play: PlaybackContextValue["play"] = async () => {
    if (!playback) {
      return;
    }
    const simState = simulationStateRef.current;
    const currentMode = snapshotRef.current.mode;
    const cfg = getPlayModeBackpressure(currentMode);

    if (simState === "NotRun") {
      await initialize({
        seed: Date.now(),
        dt: dtRef.current,
        maxFramesAhead: cfg.maxFramesAhead,
        batchSize: cfg.batchSize,
      });
      runSimulation();
      // Flip playback into Playing immediately. Don't wait for the
      // simulation-state round-trip — that creates a window where the user
      // can click again before the UI catches up.
      playback.play();
      return;
    }

    if (totalFramesRef.current === 0) {
      return;
    }

    // Resume simulation generation if not in viewOnly mode. The worker is
    // a no-op if it's already running, so it's safe to call regardless of
    // the React-mirrored simulation state.
    if (currentMode !== "viewOnly") {
      runSimulation();
    }

    // If at the end, restart from the beginning.
    const frameCount = totalFramesRef.current;
    if (snapshotRef.current.frameIndex >= frameCount - 1) {
      playback.setFrameIndex(0, frameCount);
    }
    playback.play();
  };

  const pause: PlaybackContextValue["pause"] = () => {
    if (!playback) {
      return;
    }
    if (snapshotRef.current.mode !== "viewOnly") {
      pauseSimulation();
    }
    playback.pause();
  };

  const stop: PlaybackContextValue["stop"] = () => {
    if (!playback) {
      return;
    }
    if (snapshotRef.current.mode !== "viewOnly") {
      pauseSimulation();
    }
    playback.stop();
  };

  const setPlaybackSpeed: PlaybackContextValue["setPlaybackSpeed"] = (
    nextSpeed: PlaybackSpeed,
  ) => {
    playback?.setSpeed(nextSpeed);
  };

  const setPlayMode: PlaybackContextValue["setPlayMode"] = (
    nextMode: PlayMode,
  ) => {
    if (!playback) {
      return;
    }
    if (nextMode === "viewOnly" && !isViewOnlyAvailable) {
      return;
    }
    if (nextMode !== "viewOnly" && !isComputeAvailable) {
      return;
    }

    const isPlaying = snapshotRef.current.playState === "Playing";

    if (nextMode !== "viewOnly" && isPlaying) {
      runSimulation();
    }
    if (nextMode === "viewOnly") {
      pauseSimulation();
    }

    playback.setMode(nextMode);
  };

  const currentViewedFrame = buildFrameState(currentFrame, frameIndex);

  const contextValue: PlaybackContextValue = {
    currentFrame,
    currentViewedFrame,
    playbackState: playState,
    currentFrameIndex: frameIndex,
    totalFrames,
    playbackSpeed: speed,
    playMode: mode,
    isViewOnlyAvailable,
    isComputeAvailable,
    setCurrentViewedFrame: useStableCallback(setCurrentViewedFrame),
    play: useStableCallback(play),
    pause: useStableCallback(pause),
    stop: useStableCallback(stop),
    setPlaybackSpeed: useStableCallback(setPlaybackSpeed),
    setPlayMode: useStableCallback(setPlayMode),
  };

  return (
    <PlaybackContext.Provider value={contextValue}>
      {children}
    </PlaybackContext.Provider>
  );
};
