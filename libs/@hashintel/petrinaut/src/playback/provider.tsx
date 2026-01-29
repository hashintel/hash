import { use, useCallback, useEffect, useRef, useState } from "react";

import { useStableCallback } from "../hooks/use-stable-callback";
import {
  SimulationContext,
  type SimulationContextValue,
  type SimulationFrameState,
} from "../simulation/context";
import {
  COMPUTE_BUFFER_THRESHOLD,
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
};

const initialStateValues: PlaybackStateValues = {
  playbackState: "Stopped",
  currentFrameIndex: 0,
  playbackSpeed: 1,
  playMode: "computeMax",
};

/**
 * Converts a simulation frame to a SimulationFrameState.
 */
function buildFrameState(
  simulation: SimulationContextValue["simulation"],
  frameIndex: number,
): SimulationFrameState | null {
  if (!simulation || simulation.frames.length === 0) {
    return null;
  }

  const frame = simulation.frames[frameIndex];
  if (!frame) {
    return null;
  }

  const places: SimulationFrameState["places"] = {};
  for (const [placeId, placeData] of frame.places) {
    places[placeId] = {
      tokenCount: placeData.count,
    };
  }

  const transitions: SimulationFrameState["transitions"] = {};
  for (const [transitionId, transitionData] of frame.transitions) {
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
    simulation,
    dt,
    state: simulationState,
    run: runSimulation,
    pause: pauseSimulation,
  } = use(SimulationContext);

  const [stateValues, setStateValues] =
    useState<PlaybackStateValues>(initialStateValues);

  // Stable getters for accessing latest state in animation callbacks
  const getStateValues = useStableCallback(() => stateValues);
  const getSimulation = useStableCallback(() => simulation);
  const getDt = useStableCallback(() => dt);
  const getSimulationState = useStableCallback(() => simulationState);
  const stableRunSimulation = useStableCallback(runSimulation);
  const stablePauseSimulation = useStableCallback(pauseSimulation);

  // viewOnly mode is available when there are computed frames to view
  const totalFrames = simulation?.frames.length ?? 0;
  const isViewOnlyAvailable = totalFrames > 0;

  // Compute modes are available when simulation can still compute more frames
  const isComputeAvailable =
    simulationState !== "Complete" && simulationState !== "Error";

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

    const tick = (currentTime: number) => {
      const sim = getSimulation();
      const currentDt = getDt();
      const state = getStateValues();
      const simState = getSimulationState();
      const speed = state.playbackSpeed;
      const mode = state.playMode;

      if (!sim || state.playbackState !== "Playing") {
        return;
      }

      const frameCount = sim.frames.length;
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

        // Handle computeBuffer mode: trigger computation when running low on frames
        if (mode === "computeBuffer" && simState === "Paused") {
          const framesAhead = frameCount - 1 - newFrameIndex;
          if (framesAhead < COMPUTE_BUFFER_THRESHOLD) {
            // Trigger one tick of computation
            stableRunSimulation();
            // Will be paused again in the next effect cycle
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
              playbackState: "Paused",
            }));
            return;
          }
          // If simulation is still running, stay at last available frame
          // and continue the loop to wait for more frames
          setStateValues((prev) => ({
            ...prev,
            currentFrameIndex: newFrameIndex,
          }));
        } else {
          setStateValues((prev) => ({
            ...prev,
            currentFrameIndex: newFrameIndex,
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
    getDt,
    getSimulation,
    getSimulationState,
    getStateValues,
    stableRunSimulation,
  ]);

  // For computeBuffer mode: pause simulation after each tick when buffer is sufficient
  useEffect(() => {
    if (
      stateValues.playMode === "computeBuffer" &&
      simulationState === "Running" &&
      stateValues.playbackState === "Playing"
    ) {
      const frameCount = simulation?.frames.length ?? 0;
      const framesAhead = frameCount - 1 - stateValues.currentFrameIndex;

      // If we have enough frames buffered, pause the simulation
      if (framesAhead >= COMPUTE_BUFFER_THRESHOLD) {
        pauseSimulation();
      }
    }
  }, [
    stateValues.playMode,
    stateValues.playbackState,
    stateValues.currentFrameIndex,
    simulationState,
    simulation?.frames.length,
    pauseSimulation,
  ]);

  //
  // Actions
  //

  const setCurrentViewedFrame: PlaybackContextValue["setCurrentViewedFrame"] =
    useCallback(
      (frameIndex: number) => {
        const sim = getSimulation();
        if (!sim) {
          return;
        }

        const frameCount = sim.frames.length;
        const clampedIndex = Math.max(0, Math.min(frameIndex, frameCount - 1));

        setStateValues((prev) => ({
          ...prev,
          currentFrameIndex: clampedIndex,
        }));
      },
      [getSimulation],
    );

  const play: PlaybackContextValue["play"] = useCallback(() => {
    const sim = getSimulation();
    if (!sim || sim.frames.length === 0) {
      return;
    }

    const simState = getSimulationState();
    const state = getStateValues();

    // Handle simulation control based on play mode
    if (state.playMode !== "viewOnly") {
      // Resume simulation generation if it was paused (for computeBuffer and computeMax)
      if (simState === "Paused") {
        stableRunSimulation();
      }
    }

    setStateValues((prev) => {
      // If at the end, restart from beginning
      const shouldRestart = prev.currentFrameIndex >= sim.frames.length - 1;
      return {
        ...prev,
        playbackState: "Playing",
        currentFrameIndex: shouldRestart ? 0 : prev.currentFrameIndex,
      };
    });
  }, [getSimulation, getSimulationState, getStateValues, stableRunSimulation]);

  const pause: PlaybackContextValue["pause"] = useCallback(() => {
    const simState = getSimulationState();
    const state = getStateValues();

    // Pause simulation generation if it's running (except in viewOnly mode where we don't control it)
    if (state.playMode !== "viewOnly" && simState === "Running") {
      stablePauseSimulation();
    }

    setStateValues((prev) => ({
      ...prev,
      playbackState: "Paused",
    }));
  }, [getSimulationState, getStateValues, stablePauseSimulation]);

  const stop: PlaybackContextValue["stop"] = useCallback(() => {
    setStateValues((prev) => ({
      ...prev,
      playbackState: "Stopped",
      currentFrameIndex: 0,
    }));
  }, []);

  const setPlaybackSpeed: PlaybackContextValue["setPlaybackSpeed"] =
    useCallback((speed: PlaybackSpeed) => {
      setStateValues((prev) => ({
        ...prev,
        playbackSpeed: speed,
      }));
    }, []);

  const setPlayMode: PlaybackContextValue["setPlayMode"] = useCallback(
    (mode: PlayMode) => {
      // If trying to set viewOnly but there are no frames, ignore
      if (mode === "viewOnly" && !isViewOnlyAvailable) {
        return;
      }

      // If trying to set compute mode but simulation can't compute more, ignore
      if (mode !== "viewOnly" && !isComputeAvailable) {
        return;
      }

      const simState = getSimulationState();

      // If switching away from viewOnly while simulation is paused, may need to start it
      if (mode !== "viewOnly" && stateValues.playbackState === "Playing") {
        if (simState === "Paused") {
          stableRunSimulation();
        }
      }

      // If switching to viewOnly, pause any running simulation
      if (mode === "viewOnly" && simState === "Running") {
        stablePauseSimulation();
      }

      setStateValues((prev) => ({
        ...prev,
        playMode: mode,
      }));
    },
    [
      isViewOnlyAvailable,
      isComputeAvailable,
      getSimulationState,
      stateValues.playbackState,
      stableRunSimulation,
      stablePauseSimulation,
    ],
  );

  // Compute the currently viewed frame state
  const currentViewedFrame = buildFrameState(
    simulation,
    stateValues.currentFrameIndex,
  );

  const contextValue: PlaybackContextValue = {
    currentViewedFrame,
    playbackState: stateValues.playbackState,
    currentFrameIndex: stateValues.currentFrameIndex,
    totalFrames,
    playbackSpeed: stateValues.playbackSpeed,
    playMode: stateValues.playMode,
    isViewOnlyAvailable,
    isComputeAvailable,
    setCurrentViewedFrame,
    play,
    pause,
    stop,
    setPlaybackSpeed,
    setPlayMode,
  };

  return (
    <PlaybackContext.Provider value={contextValue}>
      {children}
    </PlaybackContext.Provider>
  );
};
