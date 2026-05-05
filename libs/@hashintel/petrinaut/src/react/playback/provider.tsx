import { use, useEffect, useRef, useState } from "react";

import {
  createPlayback,
  getPlayModeBackpressure,
  type Playback,
  type PlaybackSpeed,
  type PlayMode,
} from "../../core/playback";
import { useLatest } from "../../hooks/use-latest";
import { useStableCallback } from "../../hooks/use-stable-callback";
import {
  SimulationContext,
  type SimulationFrame,
  type SimulationFrameState,
} from "../simulation/context";
import { useStore } from "../use-store";
import { PlaybackContext, type PlaybackContextValue } from "./context";

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
  const [playback] = useState<Playback>(() => createPlayback());
  useEffect(() => () => playback.dispose(), [playback]);

  const snapshot = useStore(playback.state);
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
    if (simulationState === "NotRun") {
      playback.stop();
    }
  }, [simulationState, playback]);

  // Auto-start playback when the simulation transitions into Running.
  const prevSimulationStateRef = useRef(simulationState);
  useEffect(() => {
    const prevState = prevSimulationStateRef.current;
    prevSimulationStateRef.current = simulationState;
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

  //
  // Actions
  //

  const setCurrentViewedFrame: PlaybackContextValue["setCurrentViewedFrame"] = (
    index,
  ) => {
    playback.setFrameIndex(index, totalFramesRef.current);
  };

  const play: PlaybackContextValue["play"] = async () => {
    const simState = simulationStateRef.current;
    const cfg = getPlayModeBackpressure(snapshotRef.current.mode);

    // eslint-disable-next-line no-console
    console.log("[playback] play() called", {
      simState,
      mode: snapshotRef.current.mode,
      totalFrames: totalFramesRef.current,
    });

    if (simState === "NotRun") {
      // eslint-disable-next-line no-console
      console.log("[playback] NotRun → initialize then run");
      await initialize({
        seed: Date.now(),
        dt: dtRef.current,
        maxFramesAhead: cfg.maxFramesAhead,
        batchSize: cfg.batchSize,
      });
      // The Running-state effect above will flip playback into Playing.
      // eslint-disable-next-line no-console
      console.log("[playback] post-initialize, calling runSimulation");
      runSimulation();
      return;
    }

    if (totalFramesRef.current === 0) {
      return;
    }

    // Resume simulation generation if not in viewOnly mode.
    if (snapshotRef.current.mode !== "viewOnly" && simState === "Paused") {
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
    const simState = simulationStateRef.current;
    // eslint-disable-next-line no-console
    console.log("[playback] pause() called", {
      simState,
      mode: snapshotRef.current.mode,
      willPauseSim:
        snapshotRef.current.mode !== "viewOnly" && simState === "Running",
    });
    if (snapshotRef.current.mode !== "viewOnly" && simState === "Running") {
      pauseSimulation();
    }
    playback.pause();
  };

  const stop: PlaybackContextValue["stop"] = () => {
    const simState = simulationStateRef.current;
    if (snapshotRef.current.mode !== "viewOnly" && simState === "Running") {
      pauseSimulation();
    }
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

    const simState = simulationStateRef.current;
    const isPlaying = snapshotRef.current.playState === "Playing";

    if (nextMode !== "viewOnly" && isPlaying && simState === "Paused") {
      runSimulation();
    }
    if (nextMode === "viewOnly" && simState === "Running") {
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
