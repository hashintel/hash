/**
 * @vitest-environment jsdom
 */
import { act, render, type RenderResult } from "@testing-library/react";
import { use } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SimulationContext,
  type SimulationContextValue,
  type SimulationFrameReader,
} from "../simulation/context";
import {
  DEFAULT_COMPUTE_MODE,
  PlaybackContext,
  type PlaybackContextValue,
} from "./context";
import { PlaybackProvider } from "./provider";

//
// Mock SimulationContext Factory
//

type MockSimulationContextOverrides = Partial<SimulationContextValue>;

function createMockFrameReader(number: number): SimulationFrameReader {
  return {
    number,
    time: number * 0.01,
    getPlaceTokenCount: () => 0,
    getPlaceTokens: () => [],
    getTransitionState: () => null,
    toFrameState: () => ({
      number,
      places: {},
    }),
  };
}

/**
 * Creates mock frame readers array for testing.
 */
function createMockFrameReaders(frameCount: number): SimulationFrameReader[] {
  const frames: SimulationFrameReader[] = [];
  for (let i = 0; i < frameCount; i++) {
    frames.push(createMockFrameReader(i));
  }
  return frames;
}

/**
 * Creates mock getFrame, getAllFrames, and getFramesInRange functions for testing.
 */
function createMockFrameAccessors(frames: SimulationFrameReader[]) {
  return {
    getFrame: vi.fn((index: number) => Promise.resolve(frames[index] ?? null)),
    getAllFrames: vi.fn(() => Promise.resolve(frames)),
    getFramesInRange: vi.fn((start: number, end?: number) =>
      Promise.resolve(frames.slice(start, end)),
    ),
  };
}

/**
 * Creates a mock SimulationContextValue with sensible defaults.
 * Override specific fields as needed for each test.
 * Pass `frameCount` to create mock frames automatically.
 */
function createMockSimulationContext(
  overrides: MockSimulationContextOverrides = {},
  frameCount = 0,
): SimulationContextValue {
  const frames = createMockFrameReaders(frameCount);
  const frameAccessors = createMockFrameAccessors(frames);

  return {
    state: "NotRun",
    error: null,
    errorItemId: null,
    parameterValues: {},
    initialMarking: {},
    selectedScenarioId: null,
    scenarioParameterValues: {},
    compiledScenarioResult: null,
    dt: 0.01,
    maxTime: null,
    totalFrames: frameCount,
    getFrame: frameAccessors.getFrame,
    getAllFrames: frameAccessors.getAllFrames,
    getFramesInRange: frameAccessors.getFramesInRange,
    setSelectedScenarioId: vi.fn(),
    setScenarioParameterValue: vi.fn(),
    setInitialMarking: vi.fn(),
    setParameterValue: vi.fn(),
    setDt: vi.fn(),
    setMaxTime: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
    run: vi.fn(),
    pause: vi.fn(),
    reset: vi.fn(),
    setBackpressure: vi.fn(),
    ack: vi.fn(),
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
      expect(playbackValue.playMode).toBe(DEFAULT_COMPUTE_MODE);
      expect(playbackValue.isViewOnlyAvailable).toBe(false);
      expect(playbackValue.isComputeAvailable).toBe(true);
    });

    it("should have viewOnly available when there are frames", () => {
      const simulationContext = createMockSimulationContext(
        {
          state: "Running",
        },
        10,
      );
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      const playbackValue = getPlaybackValue();
      expect(playbackValue.totalFrames).toBe(10);
      expect(playbackValue.isViewOnlyAvailable).toBe(true);
      expect(playbackValue.isComputeAvailable).toBe(true);
    });

    it("should disable compute modes when simulation is complete", () => {
      const simulationContext = createMockSimulationContext(
        {
          state: "Complete",
        },
        100,
      );
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      const playbackValue = getPlaybackValue();
      expect(playbackValue.isViewOnlyAvailable).toBe(true);
      expect(playbackValue.isComputeAvailable).toBe(false);
    });

    it("should disable compute modes when simulation has error", () => {
      const simulationContext = createMockSimulationContext(
        {
          state: "Error",
          error: "Some error",
        },
        50,
      );
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      const playbackValue = getPlaybackValue();
      expect(playbackValue.isViewOnlyAvailable).toBe(true);
      expect(playbackValue.isComputeAvailable).toBe(false);
    });
  });

  describe("effective play mode", () => {
    it("should expose viewOnly when simulation completes", () => {
      const simulationContext = createMockSimulationContext(
        {
          state: "Running",
        },
        10,
      );
      const { getPlaybackValue, rerender } =
        renderPlaybackProvider(simulationContext);

      // Initially in compute mode
      expect(getPlaybackValue().playMode).toBe(DEFAULT_COMPUTE_MODE);

      // Simulate completion
      rerender(
        createMockSimulationContext(
          {
            state: "Complete",
          },
          10,
        ),
      );

      // The exposed mode is derived from simulation state. The stored
      // requested mode remains compute mode so a later reset can run again.
      expect(getPlaybackValue().playMode).toBe("viewOnly");
    });
  });

  describe("reset on simulation reset", () => {
    it("should reset playback state when simulation is reset", () => {
      const simulationContext = createMockSimulationContext(
        {
          state: "Running",
        },
        10,
      );
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
      expect(getPlaybackValue().playMode).toBe(DEFAULT_COMPUTE_MODE);
    });
  });

  describe("setCurrentViewedFrame", () => {
    it("should set frame index within bounds", () => {
      const simulationContext = createMockSimulationContext(
        {
          state: "Running",
        },
        10,
      );
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      act(() => {
        getPlaybackValue().setCurrentViewedFrame(5);
      });

      expect(getPlaybackValue().currentFrameIndex).toBe(5);
    });

    it("should clamp frame index to valid range", () => {
      const simulationContext = createMockSimulationContext(
        {
          state: "Running",
        },
        10,
      );
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
        getPlaybackValue().setPlaybackSpeed(Number.POSITIVE_INFINITY);
      });

      expect(getPlaybackValue().playbackSpeed).toBe(Number.POSITIVE_INFINITY);
    });
  });

  describe("setPlayMode", () => {
    it("should allow setting viewOnly when frames exist", () => {
      const simulationContext = createMockSimulationContext(
        {
          state: "Running",
        },
        10,
      );
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      expect(getPlaybackValue().playMode).toBe(DEFAULT_COMPUTE_MODE);

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

      // Should still be compute mode
      expect(getPlaybackValue().playMode).toBe(DEFAULT_COMPUTE_MODE);
    });

    it("should ignore compute modes when simulation is complete", () => {
      const simulationContext = createMockSimulationContext(
        {
          state: "Complete",
        },
        10,
      );
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      // Should expose viewOnly due to Complete state
      expect(getPlaybackValue().playMode).toBe("viewOnly");

      // Try to switch to compute mode
      act(() => {
        getPlaybackValue().setPlayMode("computeBuffer");
      });

      // Should still be viewOnly
      expect(getPlaybackValue().playMode).toBe("viewOnly");
    });

    it("should pause running simulation when switching to viewOnly", () => {
      const pauseFn = vi.fn();
      const simulationContext = createMockSimulationContext(
        {
          state: "Running",
          pause: pauseFn,
        },
        10,
      );
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      act(() => {
        getPlaybackValue().setPlayMode("viewOnly");
      });

      expect(pauseFn).toHaveBeenCalled();
    });
  });

  describe("play action", () => {
    it("should initialize and start the simulation when no run exists", async () => {
      const initializeFn = vi.fn().mockResolvedValue(undefined);
      const runFn = vi.fn();
      const simulationContext = createMockSimulationContext({
        initialize: initializeFn,
        run: runFn,
      });
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      await act(async () => {
        await getPlaybackValue().play();
      });

      expect(initializeFn).toHaveBeenCalledWith(
        expect.objectContaining({
          maxFramesAhead: 40,
          batchSize: 10,
        }),
      );
      expect(runFn).toHaveBeenCalled();
      expect(getPlaybackValue().playbackState).toBe("Playing");
    });

    it("coalesces repeated play requests while initialization is pending", async () => {
      let resolveInitialization: () => void = () => {};
      const initializeFn = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveInitialization = resolve;
          }),
      );
      const runFn = vi.fn();
      const simulationContext = createMockSimulationContext({
        initialize: initializeFn,
        run: runFn,
      });
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      let firstPlay: Promise<void>;
      let secondPlay: Promise<void>;
      act(() => {
        firstPlay = getPlaybackValue().play();
        secondPlay = getPlaybackValue().play();
      });

      expect(initializeFn).toHaveBeenCalledTimes(1);
      await act(async () => {
        resolveInitialization();
        await Promise.all([firstPlay!, secondPlay!]);
      });

      expect(runFn).toHaveBeenCalledTimes(1);
      expect(getPlaybackValue().playbackState).toBe("Playing");
    });

    it("should do nothing when simulation has no frames", () => {
      const simulationContext = createMockSimulationContext(
        {
          state: "Running",
        },
        0,
      );
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      act(() => {
        void getPlaybackValue().play();
      });

      expect(getPlaybackValue().playbackState).toBe("Stopped");
    });

    it("should start playing when frames exist", () => {
      const simulationContext = createMockSimulationContext(
        {
          state: "Paused",
        },
        10,
      );
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      act(() => {
        void getPlaybackValue().play();
      });

      expect(getPlaybackValue().playbackState).toBe("Playing");
    });

    it("should restart from beginning when at the last frame", () => {
      const simulationContext = createMockSimulationContext(
        {
          state: "Paused",
        },
        10,
      );
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      // Go to last frame
      act(() => {
        getPlaybackValue().setCurrentViewedFrame(9);
      });

      expect(getPlaybackValue().currentFrameIndex).toBe(9);

      // Play should restart from beginning
      act(() => {
        void getPlaybackValue().play();
      });

      expect(getPlaybackValue().playbackState).toBe("Playing");
      expect(getPlaybackValue().currentFrameIndex).toBe(0);
    });

    it("should resume simulation when in compute mode and paused", () => {
      const runFn = vi.fn();
      const simulationContext = createMockSimulationContext(
        {
          state: "Paused",
          run: runFn,
        },
        10,
      );
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      // Ensure in compute mode
      expect(getPlaybackValue().playMode).toBe(DEFAULT_COMPUTE_MODE);

      act(() => {
        void getPlaybackValue().play();
      });

      expect(runFn).toHaveBeenCalled();
    });

    it("should not resume simulation when in viewOnly mode", () => {
      const runFn = vi.fn();
      const simulationContext = createMockSimulationContext(
        {
          state: "Paused",
          run: runFn,
        },
        10,
      );
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      // Switch to viewOnly
      act(() => {
        getPlaybackValue().setPlayMode("viewOnly");
      });

      act(() => {
        void getPlaybackValue().play();
      });

      // run should not have been called
      expect(runFn).not.toHaveBeenCalled();
    });

    it("should use compute backpressure when playing after complete/reset", async () => {
      const initializeFn = vi.fn().mockResolvedValue(undefined);
      const runFn = vi.fn();
      const { getPlaybackValue, rerender } = renderPlaybackProvider(
        createMockSimulationContext(
          {
            state: "Running",
            initialize: initializeFn,
            run: runFn,
          },
          10,
        ),
      );

      expect(getPlaybackValue().playMode).toBe(DEFAULT_COMPUTE_MODE);

      await act(async () => {
        rerender(
          createMockSimulationContext(
            {
              state: "Complete",
              initialize: initializeFn,
              run: runFn,
            },
            10,
          ),
        );
        await Promise.resolve();
      });

      expect(getPlaybackValue().playMode).toBe("viewOnly");

      await act(async () => {
        rerender(
          createMockSimulationContext({
            state: "NotRun",
            initialize: initializeFn,
            run: runFn,
          }),
        );
        await Promise.resolve();
      });

      expect(getPlaybackValue().playMode).toBe(DEFAULT_COMPUTE_MODE);

      await act(async () => {
        await getPlaybackValue().play();
      });

      expect(initializeFn).toHaveBeenCalledWith(
        expect.objectContaining({
          maxFramesAhead: 40,
          batchSize: 10,
        }),
      );
      expect(runFn).toHaveBeenCalled();
      expect(getPlaybackValue().playMode).toBe(DEFAULT_COMPUTE_MODE);
    });
  });

  describe("pause action", () => {
    it("should pause playback", () => {
      const simulationContext = createMockSimulationContext(
        {
          state: "Paused",
        },
        10,
      );
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      // Start playing
      act(() => {
        void getPlaybackValue().play();
      });

      expect(getPlaybackValue().playbackState).toBe("Playing");

      // Pause
      act(() => {
        getPlaybackValue().pause();
      });

      expect(getPlaybackValue().playbackState).toBe("Paused");
    });

    it("should pause simulation when in compute mode and simulation is running", () => {
      const pauseFn = vi.fn();
      const simulationContext = createMockSimulationContext(
        {
          state: "Running",
          pause: pauseFn,
        },
        10,
      );
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      act(() => {
        getPlaybackValue().pause();
      });

      expect(pauseFn).toHaveBeenCalled();
    });

    it("should pause simulation in compute mode regardless of mirrored state", () => {
      // Regression: the React-mirrored simulation state lags behind the
      // worker. If pause() is gated on state === "Running" the user's first
      // pause click can land while React still sees "Paused" (e.g. just after
      // init's Ready→Running flip), and the simulation keeps generating frames
      // even though playback flipped to Paused.
      const pauseFn = vi.fn();
      const simulationContext = createMockSimulationContext(
        {
          state: "Paused",
          pause: pauseFn,
        },
        10,
      );
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      act(() => {
        getPlaybackValue().pause();
      });

      expect(pauseFn).toHaveBeenCalled();
    });

    it("should not pause simulation when in viewOnly mode", () => {
      const pauseFn = vi.fn();
      const simulationContext = createMockSimulationContext(
        {
          state: "Running",
          pause: pauseFn,
        },
        10,
      );
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
      const simulationContext = createMockSimulationContext(
        {
          state: "Paused",
        },
        10,
      );
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      // Set frame and play
      act(() => {
        getPlaybackValue().setCurrentViewedFrame(5);
        void getPlaybackValue().play();
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
      const simulationContext = createMockSimulationContext(
        {
          state: "Running",
        },
        0,
      );
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      expect(getPlaybackValue().currentViewedFrame).toBeNull();
    });

    it("should return frame state for current frame index", async () => {
      const simulationContext = createMockSimulationContext(
        {
          state: "Running",
        },
        10,
      );
      const { getPlaybackValue } = renderPlaybackProvider(simulationContext);

      // Wait for initial async frame loading (flush promises and effects)
      await act(async () => {
        await Promise.resolve();
      });

      expect(getPlaybackValue().currentViewedFrame).not.toBeNull();
      expect(getPlaybackValue().currentViewedFrame!.number).toBe(0);

      // Move to frame 5
      await act(async () => {
        getPlaybackValue().setCurrentViewedFrame(5);
        await Promise.resolve();
      });

      expect(getPlaybackValue().currentViewedFrame!.number).toBe(5);
    });
  });

  describe("auto-start playback", () => {
    it("should not auto-start playback when simulation transitions to Running", () => {
      const simulationContext = createMockSimulationContext(
        {
          state: "NotRun",
        },
        10,
      );
      const { getPlaybackValue, rerender } =
        renderPlaybackProvider(simulationContext);

      expect(getPlaybackValue().playbackState).toBe("Stopped");

      // Transition to Running
      rerender(
        createMockSimulationContext(
          {
            state: "Running",
          },
          10,
        ),
      );

      expect(getPlaybackValue().playbackState).toBe("Stopped");
    });
  });
});
