import { use, useCallback, useEffect, useRef, useState } from "react";

import {
  SimulationContext,
  type SimulationContextValue,
  type SimulationFrameState,
} from "../simulation/context";
import {
  PlaybackContext,
  type PlaybackContextValue,
  type PlaybackState,
} from "./context";

/**
 * Minimum interval between frame advances in milliseconds.
 * Corresponds to 60Hz maximum playback rate.
 */
const MIN_FRAME_INTERVAL_MS = 1000 / 60;

type PlaybackStateValues = {
  /** Current playback state */
  playbackState: PlaybackState;
  /** Index of the currently viewed frame */
  currentFrameIndex: number;
};

const initialStateValues: PlaybackStateValues = {
  playbackState: "Stopped",
  currentFrameIndex: 0,
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
  const { simulation, dt, state: simulationState } = use(SimulationContext);

  const [stateValues, setStateValues] =
    useState<PlaybackStateValues>(initialStateValues);

  // Use refs to access latest state in animation callbacks
  const stateValuesRef = useRef(stateValues);
  useEffect(() => {
    stateValuesRef.current = stateValues;
  }, [stateValues]);

  const simulationRef = useRef(simulation);
  useEffect(() => {
    simulationRef.current = simulation;
  }, [simulation]);

  const dtRef = useRef(dt);
  useEffect(() => {
    dtRef.current = dt;
  }, [dt]);

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

  // Track simulation state for detecting completion
  const simulationStateRef = useRef(simulationState);
  useEffect(() => {
    simulationStateRef.current = simulationState;
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
      const sim = simulationRef.current;
      const currentDt = dtRef.current;
      const state = stateValuesRef.current;
      const simState = simulationStateRef.current;

      if (!sim || state.playbackState !== "Playing") {
        return;
      }

      const totalFrames = sim.frames.length;
      if (totalFrames === 0) {
        animationFrameId = requestAnimationFrame(tick);
        return;
      }

      // Calculate elapsed time since last tick
      const deltaTime = currentTime - lastFrameTime;
      lastFrameTime = currentTime;

      // Accumulate time and calculate how many frames to advance
      // dt is in seconds, deltaTime is in milliseconds
      accumulatedTime += deltaTime;
      const frameDurationMs = currentDt * 1000;

      // Calculate frames to advance based on accumulated time
      const framesToAdvance = Math.floor(accumulatedTime / frameDurationMs);

      if (framesToAdvance > 0) {
        accumulatedTime -= framesToAdvance * frameDurationMs;

        const desiredFrameIndex = state.currentFrameIndex + framesToAdvance;

        // Limit to available frames (simulation might still be computing)
        const newFrameIndex = Math.min(desiredFrameIndex, totalFrames - 1);

        // Check if we've reached the end of available frames
        if (newFrameIndex >= totalFrames - 1) {
          // If simulation is complete, pause playback
          if (simState === "Complete") {
            setStateValues((prev) => ({
              ...prev,
              currentFrameIndex: totalFrames - 1,
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
  }, [stateValues.playbackState]);

  //
  // Actions
  //

  const setCurrentViewedFrame: PlaybackContextValue["setCurrentViewedFrame"] =
    useCallback((frameIndex: number) => {
      const sim = simulationRef.current;
      if (!sim) {
        return;
      }

      const totalFrames = sim.frames.length;
      const clampedIndex = Math.max(0, Math.min(frameIndex, totalFrames - 1));

      setStateValues((prev) => ({
        ...prev,
        currentFrameIndex: clampedIndex,
      }));
    }, []);

  const play: PlaybackContextValue["play"] = useCallback(() => {
    const sim = simulationRef.current;
    if (!sim || sim.frames.length === 0) {
      return;
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
  }, []);

  const pause: PlaybackContextValue["pause"] = useCallback(() => {
    setStateValues((prev) => ({
      ...prev,
      playbackState: "Paused",
    }));
  }, []);

  const stop: PlaybackContextValue["stop"] = useCallback(() => {
    setStateValues({
      playbackState: "Stopped",
      currentFrameIndex: 0,
    });
  }, []);

  // Compute the currently viewed frame state
  const currentViewedFrame = buildFrameState(
    simulation,
    stateValues.currentFrameIndex,
  );

  const totalFrames = simulation?.frames.length ?? 0;

  const contextValue: PlaybackContextValue = {
    currentViewedFrame,
    playbackState: stateValues.playbackState,
    currentFrameIndex: stateValues.currentFrameIndex,
    totalFrames,
    setCurrentViewedFrame,
    play,
    pause,
    stop,
  };

  return (
    <PlaybackContext.Provider value={contextValue}>
      {children}
    </PlaybackContext.Provider>
  );
};
