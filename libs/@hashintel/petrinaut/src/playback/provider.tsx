/* eslint-disable @typescript-eslint/no-misused-promises */
import { use, useEffect, useRef, useState } from "react";

import { useLatest } from "../hooks/use-latest";
import { useStableCallback } from "../hooks/use-stable-callback";
import {
  SimulationContext,
  type SimulationFrame,
  type SimulationFrameState,
} from "../simulation/context";
import {
  PlaybackContext,
  type PlaybackContextValue,
  type PlaybackSpeed,
  type PlaybackState,
  type PlayMode,
} from "./context";

type PlaybackStateValues = {
  /** Current playback state */
  playbackState: PlaybackState;
  /** Index of the currently viewed frame */
  currentFrameIndex: number;
  /** Playback speed multiplier */
  playbackSpeed: PlaybackSpeed;
  /** Play mode determining computation behavior */
  playMode: PlayMode;
  /** The raw frame data for the current frame */
  currentFrame: SimulationFrame | null;
};

const initialStateValues: PlaybackStateValues = {
  playbackState: "Stopped",
  currentFrameIndex: 0,
  playbackSpeed: 1,
  playMode: "computeMax",
  currentFrame: null,
};

/**
 * Converts a SimulationFrame to a SimulationFrameState (simplified view).
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
    places[placeId] = {
      tokenCount: placeData.count,
    };
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
    computeBufferDuration,
    totalFrames,
    getFrame,
    run: runSimulation,
    pause: pauseSimulation,
    maxTime,
    setMaxTime,
  } = use(SimulationContext);

  const [stateValues, setStateValues] =
    useState<PlaybackStateValues>(initialStateValues);

  // Refs for accessing latest values in animation callbacks without re-triggering effects
  const stateValuesRef = useLatest(stateValues);
  const dtRef = useLatest(dt);
  const simulationStateRef = useLatest(simulationState);
  const maxTimeRef = useLatest(maxTime);
  const computeBufferDurationRef = useLatest(computeBufferDuration);
  const totalFramesRef = useLatest(totalFrames);

  // viewOnly mode is available when there are computed frames to view
  const isViewOnlyAvailable = totalFrames > 0;

  // Compute modes are available when simulation can still compute more frames
  const isComputeAvailable =
    simulationState !== "Complete" && simulationState !== "Error";

  // Fetch current frame when frame index changes
  useEffect(() => {
    let cancelled = false;

    const fetchFrame = async () => {
      const frame = await getFrame(stateValues.currentFrameIndex);
      if (!cancelled) {
        setStateValues((prev) => ({
          ...prev,
          currentFrame: frame,
        }));
      }
    };

    void fetchFrame();

    return () => {
      cancelled = true;
    };
  }, [stateValues.currentFrameIndex, getFrame, totalFrames]);

  // Auto-switch play mode based on simulation state
  useEffect(() => {
    if (!isComputeAvailable && stateValues.playMode !== "viewOnly") {
      // When simulation completes/errors, switch to viewOnly (compute modes no longer valid)
      setStateValues((prev) => ({
        ...prev,
        playMode: "viewOnly",
      }));
    }
  }, [isComputeAvailable, stateValues.playMode]);

  // Reset playback state when simulation is reset or changes
  useEffect(() => {
    if (simulationState === "NotRun") {
      setStateValues(initialStateValues);
    }
  }, [simulationState]);

  // Auto-start playback when simulation starts running
  const prevSimulationStateRef = useRef(simulationState);
  useEffect(() => {
    const prevState = prevSimulationStateRef.current;
    prevSimulationStateRef.current = simulationState;

    // When simulation transitions to Running, start playback at real-time speed
    if (simulationState === "Running" && prevState !== "Running") {
      setStateValues((prev) => ({
        ...prev,
        playbackState: "Playing",
      }));
    }
  }, [simulationState]);

  // Playback animation loop using requestAnimationFrame
  useEffect(() => {
    if (stateValues.playbackState !== "Playing") {
      return;
    }

    let animationFrameId: number | null = null;
    let lastFrameTime = performance.now();
    let accumulatedTime = 0;

    const tick = async (currentTime: number) => {
      const currentDt = dtRef.current;
      const state = stateValuesRef.current;
      const simState = simulationStateRef.current;
      const currentMaxTime = maxTimeRef.current;
      const bufferDuration = computeBufferDurationRef.current;
      const frameCount = totalFramesRef.current;
      const speed = state.playbackSpeed;
      const mode = state.playMode;

      if (state.playbackState !== "Playing") {
        return;
      }

      if (frameCount === 0) {
        animationFrameId = requestAnimationFrame(tick);
        return;
      }

      // Calculate elapsed time since last tick
      const deltaTime = currentTime - lastFrameTime;
      lastFrameTime = currentTime;

      // Accumulate time and calculate how many frames to advance
      // dt is in seconds, deltaTime is in milliseconds
      // Apply playback speed multiplier to make playback faster
      accumulatedTime += deltaTime * speed;
      const frameDurationMs = currentDt * 1000;

      // Calculate frames to advance based on accumulated time
      const framesToAdvance = Math.floor(accumulatedTime / frameDurationMs);

      if (framesToAdvance > 0) {
        accumulatedTime -= framesToAdvance * frameDurationMs;

        const desiredFrameIndex = state.currentFrameIndex + framesToAdvance;

        // Limit to available frames (simulation might still be computing)
        const newFrameIndex = Math.min(desiredFrameIndex, frameCount - 1);

        // Get current frame for buffer calculations
        const currentFrame = await getFrame(newFrameIndex);
        const currentFrameTime = currentFrame?.time ?? 0;

        // Handle computeBuffer mode: set initial maxTime or extend when approaching buffer limit
        if (mode === "computeBuffer" && simState !== "Complete") {
          if (currentMaxTime === null) {
            // No maxTime set yet - set initial buffer limit
            const initialMaxTime = currentFrameTime + bufferDuration;
            setMaxTime(initialMaxTime);
          } else if (currentFrameTime >= currentMaxTime - bufferDuration) {
            // We're within bufferDuration of maxTime, extend it
            const newMaxTime = currentMaxTime + bufferDuration;
            setMaxTime(newMaxTime);
            // Resume simulation if it was paused at maxTime
            if (simState === "Paused") {
              runSimulation();
            }
          }
        }

        // Check if we've reached the end of available frames
        if (newFrameIndex >= frameCount - 1) {
          // If simulation is complete or in viewOnly mode, pause playback
          if (
            simState === "Complete" ||
            simState === "Error" ||
            mode === "viewOnly"
          ) {
            setStateValues((prev) => ({
              ...prev,
              currentFrameIndex: frameCount - 1,
              currentFrame,
              playbackState: "Paused",
            }));
            return;
          }
          // If simulation is still running, stay at last available frame
          // and continue the loop to wait for more frames
          setStateValues((prev) => ({
            ...prev,
            currentFrameIndex: newFrameIndex,
            currentFrame,
          }));
        } else {
          setStateValues((prev) => ({
            ...prev,
            currentFrameIndex: newFrameIndex,
            currentFrame,
          }));
        }
      }

      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [
    stateValues.playbackState,
    runSimulation,
    setMaxTime,
    // These refs and stable callbacks have stable identities, safe to include
    computeBufferDurationRef,
    dtRef,
    maxTimeRef,
    simulationStateRef,
    getFrame,
    stateValuesRef,
    totalFramesRef,
  ]);

  //
  // Actions - React Compiler handles memoization automatically
  //

  const setCurrentViewedFrame: PlaybackContextValue["setCurrentViewedFrame"] = (
    frameIndex: number,
  ) => {
    const frameCount = totalFramesRef.current;
    if (frameCount === 0) {
      return;
    }

    const clampedIndex = Math.max(0, Math.min(frameIndex, frameCount - 1));

    setStateValues((prev) => ({
      ...prev,
      currentFrameIndex: clampedIndex,
    }));
  };

  const play: PlaybackContextValue["play"] = async () => {
    const frameCount = totalFramesRef.current;
    if (frameCount === 0) {
      return;
    }

    const simState = simulationStateRef.current;
    const state = stateValuesRef.current;
    const currentMaxTime = maxTimeRef.current;
    const bufferDuration = computeBufferDurationRef.current;

    // Handle simulation control based on play mode
    if (state.playMode !== "viewOnly") {
      // For computeBuffer mode, ensure maxTime is set before resuming
      if (state.playMode === "computeBuffer" && currentMaxTime === null) {
        const currentFrame = await getFrame(state.currentFrameIndex);
        const currentFrameTime = currentFrame?.time ?? 0;
        setMaxTime(currentFrameTime + bufferDuration);
      }

      // Resume simulation generation if it was paused (for computeBuffer and computeMax)
      if (simState === "Paused") {
        runSimulation();
      }
    }

    setStateValues((prev) => {
      // If at the end, restart from beginning
      const shouldRestart = prev.currentFrameIndex >= frameCount - 1;
      return {
        ...prev,
        playbackState: "Playing",
        currentFrameIndex: shouldRestart ? 0 : prev.currentFrameIndex,
      };
    });
  };

  const pause: PlaybackContextValue["pause"] = () => {
    const simState = simulationStateRef.current;
    const state = stateValuesRef.current;

    // Pause simulation generation if it's running (except in viewOnly mode where we don't control it)
    if (state.playMode !== "viewOnly" && simState === "Running") {
      pauseSimulation();
    }

    setStateValues((prev) => ({
      ...prev,
      playbackState: "Paused",
    }));
  };

  const stop: PlaybackContextValue["stop"] = () => {
    setStateValues((prev) => ({
      ...prev,
      playbackState: "Stopped",
      currentFrameIndex: 0,
    }));
  };

  const setPlaybackSpeed: PlaybackContextValue["setPlaybackSpeed"] = (
    speed: PlaybackSpeed,
  ) => {
    setStateValues((prev) => ({
      ...prev,
      playbackSpeed: speed,
    }));
  };

  const setPlayMode: PlaybackContextValue["setPlayMode"] = async (
    mode: PlayMode,
  ) => {
    // If trying to set viewOnly but there are no frames, ignore
    if (mode === "viewOnly" && !isViewOnlyAvailable) {
      return;
    }

    // If trying to set compute mode but simulation can't compute more, ignore
    if (mode !== "viewOnly" && !isComputeAvailable) {
      return;
    }

    const simState = simulationStateRef.current;
    const currentMaxTime = maxTimeRef.current;
    const bufferDuration = computeBufferDurationRef.current;
    const frameCount = totalFramesRef.current;
    const state = stateValuesRef.current;

    // If switching to computeBuffer, set initial maxTime if not already set
    if (mode === "computeBuffer" && currentMaxTime === null && frameCount > 0) {
      const currentFrame = await getFrame(state.currentFrameIndex);
      const currentFrameTime = currentFrame?.time ?? 0;
      setMaxTime(currentFrameTime + bufferDuration);
    }

    // If switching away from computeBuffer to computeMax, remove maxTime limit
    if (mode === "computeMax" && currentMaxTime !== null) {
      setMaxTime(null);
    }

    // If switching away from viewOnly while simulation is paused, may need to start it
    if (mode !== "viewOnly" && state.playbackState === "Playing") {
      if (simState === "Paused") {
        runSimulation();
      }
    }

    // If switching to viewOnly, pause any running simulation
    if (mode === "viewOnly" && simState === "Running") {
      pauseSimulation();
    }

    setStateValues((prev) => ({
      ...prev,
      playMode: mode,
    }));
  };

  // Compute the currently viewed frame state (simplified view)
  const currentViewedFrame = buildFrameState(
    stateValues.currentFrame,
    stateValues.currentFrameIndex,
  );

  const contextValue: PlaybackContextValue = {
    currentFrame: stateValues.currentFrame,
    currentViewedFrame,
    playbackState: stateValues.playbackState,
    currentFrameIndex: stateValues.currentFrameIndex,
    totalFrames,
    playbackSpeed: stateValues.playbackSpeed,
    playMode: stateValues.playMode,
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
