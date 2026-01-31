/**
 * @vitest-environment jsdom
 */
import { act, render, type RenderResult } from "@testing-library/react";
import { use } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SimulationContext,
  type SimulationContextValue,
  type SimulationFrame,
  type SimulationInstance,
} from "../simulation/context";
import { PlaybackContext, type PlaybackContextValue } from "./context";
import { PlaybackProvider } from "./provider";

//
// Mock SimulationContext Factory
//

type MockSimulationContextOverrides = Partial<SimulationContextValue>;

/**
 * Creates a minimal SimulationFrame for testing.
 */
function createMockFrame(time: number): SimulationFrame {
  return {
    time,
    places: {},
    transitions: {},
    buffer: new Float64Array(),
  };
}

/**
 * Creates a minimal SimulationInstance for testing.
 */
function createMockSimulation(frameCount: number): SimulationInstance {
  const simulation: SimulationInstance = {
    places: new Map(),
    transitions: new Map(),
    types: new Map(),
    differentialEquationFns: new Map(),
    lambdaFns: new Map(),
    transitionKernelFns: new Map(),
    parameterValues: {},
    dt: 0.01,
    rngState: 0,
    frames: [],
    currentFrameNumber: 0,
  };

  // Add frames
  for (let i = 0; i < frameCount; i++) {
    simulation.frames.push(createMockFrame(i * 0.01));
  }

  return simulation;
}

/**
 * Creates a mock SimulationContextValue with sensible defaults.
 * Override specific fields as needed for each test.
 */
function createMockSimulationContext(
  overrides: MockSimulationContextOverrides = {},
): SimulationContextValue {
  return {
    simulation: null,
    state: "NotRun",
    error: null,
    errorItemId: null,
    parameterValues: {},
    initialMarking: new Map(),
    dt: 0.01,
    maxTime: null,
    computeBufferDuration: 1,
    setInitialMarking: vi.fn(),
    setParameterValue: vi.fn(),
    setDt: vi.fn(),
    setMaxTime: vi.fn(),
    setComputeBufferDuration: vi.fn(),
    initializeParameterValuesFromDefaults: vi.fn(),
    initialize: vi.fn(),
    run: vi.fn(),
    pause: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

//
// Test Harness
//

/**
 * A test component that consumes PlaybackContext and exposes its value.
 */
const PlaybackContextConsumer = ({
  onContextValue,
}: {
  onContextValue: (value: PlaybackContextValue) => void;
}) => {
  const contextValue = use(PlaybackContext);
  // Call the callback during render to capture the value
  onContextValue(contextValue);
  return null;
};

// Component wrapper for testing - defined outside to avoid closure issues with React Compiler
const TestWrapper = ({
  simContext,
  onContextValue,
}: {
  simContext: SimulationContextValue;
  onContextValue: (value: PlaybackContextValue) => void;
}) => (
  <SimulationContext.Provider value={simContext}>
    <PlaybackProvider>
      <PlaybackContextConsumer onContextValue={onContextValue} />
    </PlaybackProvider>
  </SimulationContext.Provider>
);

/**
 * Renders the PlaybackProvider with a mock SimulationContext and returns
 * a function to get the current PlaybackContext value.
 */
function renderPlaybackProvider(simulationContext: SimulationContextValue): {
  getPlaybackValue: () => PlaybackContextValue;
  renderResult: RenderResult;
  rerender: (newSimulationContext: SimulationContextValue) => void;
} {
  // Use an object to hold the value so we can mutate it from the callback
  const valueHolder = { current: null as PlaybackContextValue | null };
  const captureValue = (value: PlaybackContextValue) => {
    valueHolder.current = value;
  };

  const renderResult = render(
    <TestWrapper
      simContext={simulationContext}
      onContextValue={captureValue}
    />,
  );

  return {
    getPlaybackValue: () => valueHolder.current!,
    renderResult,
    rerender: (newSimulationContext: SimulationContextValue) => {
      renderResult.rerender(
        <TestWrapper
          simContext={newSimulationContext}
          onContextValue={captureValue}
        />,
      );
    },
  };
}

//
// Tests
//

describe("PlaybackProvider", () => {
  let rafCallbacks: Array<(time: number) => void> = [];
  let rafId = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    rafCallbacks = [];
    rafId = 0;

    // Mock requestAnimationFrame
    globalThis.requestAnimationFrame = vi.fn(
      (callback: FrameRequestCallback) => {
        const id = ++rafId;
        rafCallbacks.push(callback);
        return id;
      },
    );

    globalThis.cancelAnimationFrame = vi.fn((_id) => {
      // Simple mock - doesn't actually cancel but that's fine for tests
    });

    // Mock performance.now
    vi.spyOn(performance, "now").mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("should have default values when simulation is not running", () => {
      const simulationContext = createMockSimulationContext();
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      const playbackValue = getPlaybackValue();
      expect(playbackValue.playbackState).toBe("Stopped");
      expect(playbackValue.currentFrameIndex).toBe(0);
      expect(playbackValue.totalFrames).toBe(0);
      expect(playbackValue.playbackSpeed).toBe(1);
      expect(playbackValue.playMode).toBe("computeMax");
      expect(playbackValue.isViewOnlyAvailable).toBe(false);
      expect(playbackValue.isComputeAvailable).toBe(true);
    });

    it("should have viewOnly available when there are frames", () => {
      const simulation = createMockSimulation(10);
      const simulationContext = createMockSimulationContext({
        simulation,
        state: "Running",
      });
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      const playbackValue = getPlaybackValue();
      expect(playbackValue.totalFrames).toBe(10);
      expect(playbackValue.isViewOnlyAvailable).toBe(true);
      expect(playbackValue.isComputeAvailable).toBe(true);
    });

    it("should disable compute modes when simulation is complete", () => {
      const simulation = createMockSimulation(100);
      const simulationContext = createMockSimulationContext({
        simulation,
        state: "Complete",
      });
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      const playbackValue = getPlaybackValue();
      expect(playbackValue.isViewOnlyAvailable).toBe(true);
      expect(playbackValue.isComputeAvailable).toBe(false);
    });

    it("should disable compute modes when simulation has error", () => {
      const simulation = createMockSimulation(50);
      const simulationContext = createMockSimulationContext({
        simulation,
        state: "Error",
        error: "Some error",
      });
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      const playbackValue = getPlaybackValue();
      expect(playbackValue.isViewOnlyAvailable).toBe(true);
      expect(playbackValue.isComputeAvailable).toBe(false);
    });
  });

  describe("auto-switch play mode", () => {
    it("should switch to viewOnly when simulation completes", () => {
      const simulation = createMockSimulation(10);
      const simulationContext = createMockSimulationContext({
        simulation,
        state: "Running",
      });
      const { getPlaybackValue, rerender } =
        renderPlaybackProvider(simulationContext);

      // Initially in computeMax mode
      expect(getPlaybackValue().playMode).toBe("computeMax");

      // Simulate completion
      rerender(
        createMockSimulationContext({
          simulation,
          state: "Complete",
        }),
      );

      // Should auto-switch to viewOnly
      expect(getPlaybackValue().playMode).toBe("viewOnly");
    });
  });

  describe("reset on simulation reset", () => {
    it("should reset playback state when simulation is reset", () => {
      const simulation = createMockSimulation(10);
      const simulationContext = createMockSimulationContext({
        simulation,
        state: "Running",
      });
      const { getPlaybackValue, rerender } =
        renderPlaybackProvider(simulationContext);

      // Manually advance frame index
      act(() => {
        getPlaybackValue().setCurrentViewedFrame(5);
      });

      expect(getPlaybackValue().currentFrameIndex).toBe(5);

      // Reset simulation
      rerender(createMockSimulationContext({ state: "NotRun" }));

      // Should reset to initial state
      expect(getPlaybackValue().currentFrameIndex).toBe(0);
      expect(getPlaybackValue().playbackState).toBe("Stopped");
      expect(getPlaybackValue().playMode).toBe("computeMax");
    });
  });

  describe("setCurrentViewedFrame", () => {
    it("should set frame index within bounds", () => {
      const simulation = createMockSimulation(10);
      const simulationContext = createMockSimulationContext({
        simulation,
        state: "Running",
      });
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      act(() => {
        getPlaybackValue().setCurrentViewedFrame(5);
      });

      expect(getPlaybackValue().currentFrameIndex).toBe(5);
    });

    it("should clamp frame index to valid range", () => {
      const simulation = createMockSimulation(10);
      const simulationContext = createMockSimulationContext({
        simulation,
        state: "Running",
      });
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      // Try to set beyond max
      act(() => {
        getPlaybackValue().setCurrentViewedFrame(100);
      });

      expect(getPlaybackValue().currentFrameIndex).toBe(9); // Clamped to last frame

      // Try to set negative
      act(() => {
        getPlaybackValue().setCurrentViewedFrame(-5);
      });

      expect(getPlaybackValue().currentFrameIndex).toBe(0); // Clamped to 0
    });

    it("should do nothing when no simulation exists", () => {
      const simulationContext = createMockSimulationContext();
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      act(() => {
        getPlaybackValue().setCurrentViewedFrame(5);
      });

      expect(getPlaybackValue().currentFrameIndex).toBe(0);
    });
  });

  describe("setPlaybackSpeed", () => {
    it("should update playback speed", () => {
      const simulationContext = createMockSimulationContext();
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      expect(getPlaybackValue().playbackSpeed).toBe(1);

      act(() => {
        getPlaybackValue().setPlaybackSpeed(10);
      });

      expect(getPlaybackValue().playbackSpeed).toBe(10);

      act(() => {
        getPlaybackValue().setPlaybackSpeed(Infinity);
      });

      expect(getPlaybackValue().playbackSpeed).toBe(Infinity);
    });
  });

  describe("setPlayMode", () => {
    it("should allow setting viewOnly when frames exist", () => {
      const simulation = createMockSimulation(10);
      const simulationContext = createMockSimulationContext({
        simulation,
        state: "Running",
      });
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      expect(getPlaybackValue().playMode).toBe("computeMax");

      act(() => {
        getPlaybackValue().setPlayMode("viewOnly");
      });

      expect(getPlaybackValue().playMode).toBe("viewOnly");
    });

    it("should ignore viewOnly when no frames exist", () => {
      const simulationContext = createMockSimulationContext({
        state: "Running",
      });
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      act(() => {
        getPlaybackValue().setPlayMode("viewOnly");
      });

      // Should still be computeMax
      expect(getPlaybackValue().playMode).toBe("computeMax");
    });

    it("should ignore compute modes when simulation is complete", () => {
      const simulation = createMockSimulation(10);
      const simulationContext = createMockSimulationContext({
        simulation,
        state: "Complete",
      });
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      // Should auto-switch to viewOnly due to Complete state
      expect(getPlaybackValue().playMode).toBe("viewOnly");

      // Try to switch to compute mode
      act(() => {
        getPlaybackValue().setPlayMode("computeBuffer");
      });

      // Should still be viewOnly
      expect(getPlaybackValue().playMode).toBe("viewOnly");
    });

    it("should pause running simulation when switching to viewOnly", () => {
      const simulation = createMockSimulation(10);
      const pauseFn = vi.fn();
      const simulationContext = createMockSimulationContext({
        simulation,
        state: "Running",
        pause: pauseFn,
      });
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      act(() => {
        getPlaybackValue().setPlayMode("viewOnly");
      });

      expect(pauseFn).toHaveBeenCalled();
    });
  });

  describe("play action", () => {
    it("should do nothing when no simulation exists", () => {
      const simulationContext = createMockSimulationContext();
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      act(() => {
        getPlaybackValue().play();
      });

      expect(getPlaybackValue().playbackState).toBe("Stopped");
    });

    it("should do nothing when simulation has no frames", () => {
      const simulation = createMockSimulation(0);
      const simulationContext = createMockSimulationContext({
        simulation,
        state: "Running",
      });
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      act(() => {
        getPlaybackValue().play();
      });

      expect(getPlaybackValue().playbackState).toBe("Stopped");
    });

    it("should start playing when frames exist", () => {
      const simulation = createMockSimulation(10);
      const simulationContext = createMockSimulationContext({
        simulation,
        state: "Paused",
      });
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      act(() => {
        getPlaybackValue().play();
      });

      expect(getPlaybackValue().playbackState).toBe("Playing");
    });

    it("should restart from beginning when at the last frame", () => {
      const simulation = createMockSimulation(10);
      const simulationContext = createMockSimulationContext({
        simulation,
        state: "Paused",
      });
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      // Go to last frame
      act(() => {
        getPlaybackValue().setCurrentViewedFrame(9);
      });

      expect(getPlaybackValue().currentFrameIndex).toBe(9);

      // Play should restart from beginning
      act(() => {
        getPlaybackValue().play();
      });

      expect(getPlaybackValue().playbackState).toBe("Playing");
      expect(getPlaybackValue().currentFrameIndex).toBe(0);
    });

    it("should resume simulation when in compute mode and paused", () => {
      const simulation = createMockSimulation(10);
      const runFn = vi.fn();
      const simulationContext = createMockSimulationContext({
        simulation,
        state: "Paused",
        run: runFn,
      });
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      // Ensure in compute mode
      expect(getPlaybackValue().playMode).toBe("computeMax");

      act(() => {
        getPlaybackValue().play();
      });

      expect(runFn).toHaveBeenCalled();
    });

    it("should not resume simulation when in viewOnly mode", () => {
      const simulation = createMockSimulation(10);
      const runFn = vi.fn();
      const simulationContext = createMockSimulationContext({
        simulation,
        state: "Paused",
        run: runFn,
      });
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      // Switch to viewOnly
      act(() => {
        getPlaybackValue().setPlayMode("viewOnly");
      });

      act(() => {
        getPlaybackValue().play();
      });

      // run should not have been called
      expect(runFn).not.toHaveBeenCalled();
    });
  });

  describe("pause action", () => {
    it("should pause playback", () => {
      const simulation = createMockSimulation(10);
      const simulationContext = createMockSimulationContext({
        simulation,
        state: "Paused",
      });
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      // Start playing
      act(() => {
        getPlaybackValue().play();
      });

      expect(getPlaybackValue().playbackState).toBe("Playing");

      // Pause
      act(() => {
        getPlaybackValue().pause();
      });

      expect(getPlaybackValue().playbackState).toBe("Paused");
    });

    it("should pause simulation when in compute mode and simulation is running", () => {
      const simulation = createMockSimulation(10);
      const pauseFn = vi.fn();
      const simulationContext = createMockSimulationContext({
        simulation,
        state: "Running",
        pause: pauseFn,
      });
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      act(() => {
        getPlaybackValue().pause();
      });

      expect(pauseFn).toHaveBeenCalled();
    });

    it("should not pause simulation when in viewOnly mode", () => {
      const simulation = createMockSimulation(10);
      const pauseFn = vi.fn();
      const simulationContext = createMockSimulationContext({
        simulation,
        state: "Running",
        pause: pauseFn,
      });
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      // Switch to viewOnly (this will call pause once)
      act(() => {
        getPlaybackValue().setPlayMode("viewOnly");
      });

      expect(pauseFn).toHaveBeenCalledTimes(1);

      // Now pause playback - should not call simulation pause again
      // because we're in viewOnly mode
      act(() => {
        getPlaybackValue().pause();
      });

      // pause was only called once (from setPlayMode)
      expect(pauseFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("stop action", () => {
    it("should stop playback and reset to frame 0", () => {
      const simulation = createMockSimulation(10);
      const simulationContext = createMockSimulationContext({
        simulation,
        state: "Paused",
      });
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      // Set frame and play
      act(() => {
        getPlaybackValue().setCurrentViewedFrame(5);
        getPlaybackValue().play();
      });

      expect(getPlaybackValue().currentFrameIndex).toBe(5);
      expect(getPlaybackValue().playbackState).toBe("Playing");

      // Stop
      act(() => {
        getPlaybackValue().stop();
      });

      expect(getPlaybackValue().playbackState).toBe("Stopped");
      expect(getPlaybackValue().currentFrameIndex).toBe(0);
    });
  });

  describe("currentViewedFrame", () => {
    it("should be null when no simulation exists", () => {
      const simulationContext = createMockSimulationContext();
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      expect(getPlaybackValue().currentViewedFrame).toBeNull();
    });

    it("should be null when simulation has no frames", () => {
      const simulation = createMockSimulation(0);
      const simulationContext = createMockSimulationContext({
        simulation,
        state: "Running",
      });
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      expect(getPlaybackValue().currentViewedFrame).toBeNull();
    });

    it("should return frame state for current frame index", () => {
      const simulation = createMockSimulation(10);
      const simulationContext = createMockSimulationContext({
        simulation,
        state: "Running",
      });
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      expect(getPlaybackValue().currentViewedFrame).not.toBeNull();
      expect(getPlaybackValue().currentViewedFrame!.number).toBe(0);
      expect(getPlaybackValue().currentViewedFrame!.time).toBe(0);

      // Move to frame 5
      act(() => {
        getPlaybackValue().setCurrentViewedFrame(5);
      });

      expect(getPlaybackValue().currentViewedFrame!.number).toBe(5);
      expect(getPlaybackValue().currentViewedFrame!.time).toBeCloseTo(0.05);
    });
  });

  describe("auto-start playback", () => {
    it("should auto-start playback when simulation transitions to Running", () => {
      const simulation = createMockSimulation(10);
      const simulationContext = createMockSimulationContext({
        simulation,
        state: "NotRun",
      });
      const { getPlaybackValue, rerender } =
        renderPlaybackProvider(simulationContext);

      expect(getPlaybackValue().playbackState).toBe("Stopped");

      // Transition to Running
      rerender(
        createMockSimulationContext({
          simulation,
          state: "Running",
        }),
      );

      expect(getPlaybackValue().playbackState).toBe("Playing");
    });
  });
});
