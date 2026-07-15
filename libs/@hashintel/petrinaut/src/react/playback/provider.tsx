import { use, useEffect, useRef, useState } from "react";

import {
  createPlayback,
  getPlayModeBackpressure,
  type ComputePlayMode,
  type Playback,
  type PlaybackSpeed,
  type PlayMode,
} from "@hashintel/petrinaut-core";

import { useLatest } from "../hooks/use-latest";
import { useStableCallback } from "../hooks/use-stable-callback";
import {
  SimulationContext,
  type SimulationContextValue,
  type SimulationFrameReader,
  type SimulationFrameState,
} from "../simulation/context";
import { useStore } from "../use-store";
import {
  DEFAULT_COMPUTE_MODE,
  PlaybackContext,
  type PlaybackContextValue,
} from "./context";

/**
 * Converts a {@link SimulationFrameReader} to the simplified {@link SimulationFrameState}
 * shape consumed by visualisations.
 */
function buildFrameState(
  frame: SimulationFrameReader | null,
): SimulationFrameState | null {
  return frame?.toFrameState() ?? null;
}

function isSimulationComputeAvailable(
  simulationState: SimulationContextValue["state"],
): boolean {
  return simulationState !== "Complete" && simulationState !== "Error";
}

function getEffectivePlayMode(
  requestedMode: PlayMode,
  simulationState: SimulationContextValue["state"],
  totalFrames: number,
): PlayMode {
  if (!isSimulationComputeAvailable(simulationState)) {
    return "viewOnly";
  }
  if (requestedMode === "viewOnly" && totalFrames === 0) {
    return DEFAULT_COMPUTE_MODE;
  }
  return requestedMode;
}

function toComputePlayMode(mode: PlayMode): ComputePlayMode {
  if (mode === "viewOnly") {
    return DEFAULT_COMPUTE_MODE;
  }
  return mode;
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

  const { playMode } = use(PlaybackContext);

  // Pure timing model lives in /core. The provider drives ticks via rAF and
  // coordinates simulation lifecycle (init / run / pause / ack / backpressure).
  const [playback] = useState<Playback>(() =>
    createPlayback({ mode: playMode }),
  );
  useEffect(() => {
    return playback.dispose;
  }, [playback]);

  const snapshot = useStore(playback.state);
  const { playState, frameIndex, speed, mode: requestedMode } = snapshot;

  // Currently displayed frame data, fetched from the simulation when the
  // index changes.
  const [currentFrameReader, setCurrentFrameReader] =
    useState<SimulationFrameReader | null>(null);

  // Refs for stable identities inside the rAF loop / callbacks.
  const dtRef = useLatest(dt);
  const simulationStateRef = useLatest(simulationState);
  const totalFramesRef = useLatest(totalFrames);
  const snapshotRef = useLatest(snapshot);

  // viewOnly mode is available when there are computed frames to view.
  const isViewOnlyAvailable = totalFrames > 0;

  // Compute modes are available when simulation can still compute more frames.
  const isComputeAvailable = isSimulationComputeAvailable(simulationState);
  const mode = getEffectivePlayMode(
    requestedMode,
    simulationState,
    totalFrames,
  );

  const getCurrentMode = () =>
    getEffectivePlayMode(
      snapshotRef.current.mode,
      simulationStateRef.current,
      totalFramesRef.current,
    );
  const getCurrentComputeMode = () => toComputePlayMode(getCurrentMode());
  const pauseSimulationIfComputing = () => {
    if (getCurrentMode() !== "viewOnly") {
      pauseSimulation();
    }
  };

  // Fetch frame whenever the index changes.
  useEffect(() => {
    let cancelled = false;
    void getFrame(frameIndex).then((frame) => {
      if (!cancelled) {
        setCurrentFrameReader(frame);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [frameIndex, getFrame, totalFrames]);

  // Reset playback state when the simulation transitions back to NotRun.
  const prevSimulationStateRef = useRef(simulationState);
  useEffect(() => {
    const prevState = prevSimulationStateRef.current;
    prevSimulationStateRef.current = simulationState;
    if (
      simulationState === "NotRun" &&
      prevState !== "NotRun" &&
      (playState !== "Stopped" || frameIndex !== 0)
    ) {
      playback.stop();
    }
  }, [simulationState, playState, frameIndex, playback]);

  // Backpressure ack — based on play mode.
  const prevTotalFramesRef = useRef(totalFrames);
  const playInitializationRef = useRef<Promise<void> | null>(null);
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
    if (playState !== "Playing") {
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

  const setCurrentViewedFrame: PlaybackContextValue["setCurrentViewedFrame"] = (
    index,
  ) => {
    playback.setFrameIndex(index, totalFramesRef.current);
  };

  const play: PlaybackContextValue["play"] = async () => {
    const simState = simulationStateRef.current;
    const currentMode = getCurrentMode();
    const computeMode = getCurrentComputeMode();
    const cfg = getPlayModeBackpressure(computeMode);

    if (simState === "NotRun") {
      const inFlight = playInitializationRef.current;
      if (inFlight) {
        await inFlight;
        return;
      }
      if (snapshotRef.current.mode !== computeMode) {
        playback.setMode(computeMode);
      }
      const initialization = (async () => {
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
      })();
      playInitializationRef.current = initialization;
      try {
        await initialization;
      } finally {
        if (playInitializationRef.current === initialization) {
          playInitializationRef.current = null;
        }
      }
      return;
    }

    if (totalFramesRef.current === 0) {
      return;
    }

    // Resume simulation generation if not in viewOnly mode. The worker is
    // a no-op if it's already running, so it's safe to call regardless of
    // the React-mirrored simulation state.
    if (currentMode !== "viewOnly") {
      setBackpressure(cfg);
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
    pauseSimulationIfComputing();
    playback.pause();
  };

  const stop: PlaybackContextValue["stop"] = () => {
    pauseSimulationIfComputing();
    playback.stop();
  };

  const setPlaybackSpeed: PlaybackContextValue["setPlaybackSpeed"] = (
    nextSpeed: PlaybackSpeed,
  ) => {
    playback.setSpeed(nextSpeed);
  };

  const setPlayMode: PlaybackContextValue["setPlayMode"] = (
    nextMode: PlayMode,
  ) => {
    if (nextMode === "viewOnly" && !isViewOnlyAvailable) {
      return;
    }
    if (nextMode !== "viewOnly" && !isComputeAvailable) {
      return;
    }

    const isPlaying = snapshotRef.current.playState === "Playing";

    if (nextMode === "viewOnly") {
      pauseSimulation();
    } else {
      setBackpressure(getPlayModeBackpressure(nextMode));
      if (isPlaying) {
        runSimulation();
      }
    }

    playback.setMode(nextMode);
  };

  const currentViewedFrame = buildFrameState(currentFrameReader);

  const contextValue: PlaybackContextValue = {
    currentFrameReader,
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
