import { createContext } from "react";

import {
  type AdHocScenarioState,
  type CompiledScenarioResult,
  type EventSimulation,
  type EventSolverConfig,
  type Parameter,
  type InitialMarking,
  type InitialPlaceMarking,
  type ScenarioCompilationError,
  type SimulationFrameReader,
  type SimulationFrameState,
  type ReadableStore,
} from "@hashintel/petrinaut-core";

/**
 * Which runtime a Quick Simulation runs on.
 *
 * - `fixed-step`: one frame per time step `dt`, the frame-per-step runtime.
 * - `event-driven`: one frame per transition firing, the state in between
 *   interpolated from the surrounding frames. Experimental.
 */
export type SimulationEngine = "fixed-step" | "event-driven";

// Re-export for back-compat with existing consumers that import these from
// the simulation context module.
export type {
  InitialMarking,
  InitialPlaceMarking,
  SimulationFrameReader,
  SimulationFrameState,
};

/**
 * Current state of the simulation lifecycle, as the editor UI consumes it.
 *
 * Note: this is the legacy 5-state shape; the canonical core state lives in
 * `@hashintel/petrinaut-core` (`SimulationState` from `core/simulation`) and
 * has six values including `Initializing` and `Ready`. The provider maps
 * between the two.
 */
export type SimulationState =
  | "NotRun"
  | "Running"
  | "Complete"
  | "Error"
  | "Paused";

/**
 * The combined simulation context containing both state and actions.
 *
 * Note: The full SimulationInstance and raw frame storage are not exposed.
 * Instead, use `getFrame()` to access individual frames through a
 * `SimulationFrameReader`.
 */
export type SimulationContextValue = {
  // State values
  /**
   * Current lifecycle state of the simulation.
   */
  state: SimulationState;
  /**
   * Error message if state is "Error".
   */
  error: string | null;
  /**
   * ID of the SDCPN item that caused the error, if applicable.
   */
  errorItemId: string | null;
  /**
   * Current parameter values (string representation for UI binding).
   */
  parameterValues: Record<string, string>;
  /**
   * Initial token distribution for each place.
   */
  initialMarking: InitialMarking;
  /**
   * Time step for simulation advancement.
   */
  dt: number;
  /**
   * Maximum simulation time in seconds.
   * When the simulation reaches this time, it will be paused.
   * If null, the simulation runs until no transitions are enabled.
   */
  maxTime: number | null;
  /**
   * Total number of computed frames available. On the event-driven engine,
   * the number of recorded events.
   */
  /**
   * Frames recorded so far, or events for the event-driven engine. A store
   * rather than a number, so the context value holds still while a run
   * streams and only what shows the count renders on each batch.
   */
  totalFramesStore: ReadableStore<number>;
  /**
   * The runtime the next run uses. Changing it discards the current run.
   */
  engine: SimulationEngine;
  /**
   * How the event-driven engine advances between events. Changing it
   * discards the current run; the fixed-step engine ignores it.
   */
  eventSolver: EventSolverConfig;
  /**
   * The event-driven run's handle while `engine` is `event-driven` and a run
   * exists; null otherwise. Playback over events reads the trace through it.
   */
  eventSimulation: EventSimulation | null;

  // Frame access
  /**
   * Get a specific frame by index.
   * Returns null if the index is out of bounds or no simulation exists.
   *
   * This is the primary way to access frame data. The full frame history
   * is kept internal to the provider for memory management.
   *
   * @param frameIndex - The index of the frame to retrieve (0-based)
   * @returns Promise resolving to the frame reader or null
   */
  getFrame: (frameIndex: number) => Promise<SimulationFrameReader | null>;

  /**
   * Get all computed frames.
   * Returns an empty array if no simulation exists.
   *
   * Note: For large simulations, this may return a large array.
   * Consider using getFrame() for single-frame access when possible.
   *
   * @returns Promise resolving to array of all frame readers
   */
  getAllFrames: () => Promise<SimulationFrameReader[]>;

  /**
   * Get frames in a specified range.
   * Returns frames from startIndex (inclusive) to endIndex (exclusive).
   * If endIndex is not provided, returns frames from startIndex to the end.
   *
   * This is more efficient than getAllFrames() when you only need a subset
   * of frames, such as when incrementally updating a visualization.
   *
   * @param startIndex - The starting frame index (inclusive, 0-based)
   * @param endIndex - The ending frame index (exclusive). If omitted, returns to the end.
   * @returns Promise resolving to array of frame readers in the range
   */
  getFramesInRange: (
    startIndex: number,
    endIndex?: number,
  ) => Promise<SimulationFrameReader[]>;

  /**
   * ID of the currently selected scenario, or `null` for no scenario.
   * When set, initial state and parameter values are defined by the scenario.
   */
  selectedScenarioId: string | null;
  /**
   * Current values for scenario-specific parameters (editable by the user).
   * Keyed by scenario parameter identifier.
   */
  scenarioParameterValues: Record<string, string>;
  /**
   * Compiled scenario result — resolved parameter values and initial state
   * produced by evaluating scenario expressions with current parameter values.
   * Null when no scenario is selected or compilation failed.
   */
  compiledScenarioResult: CompiledScenarioResult | null;
  /**
   * Errors from the last scenario compilation, or null when no scenario is
   * selected or it compiled cleanly. Non-null exactly when a scenario is
   * selected and `compiledScenarioResult` is null — surfaced in the UI so a
   * failing scenario is never silently ignored.
   */
  scenarioCompilationErrors: ScenarioCompilationError[] | null;
  /**
   * The inline initial-state + parameters definition used when no scenario
   * is selected. Compiled through a scenario generated at run time and never
   * persisted into the net file. Null until the user defines one.
   */
  adHocScenario: AdHocScenarioState | null;
  /**
   * The net's parameters with the panel's current values overlaid as their
   * defaults — exactly what ad-hoc synthesis and a Play run compile
   * against. Embeddings pass these to the form so the defaults it displays
   * are the ones the run resolves (the raw inputs are hidden while the
   * ad-hoc embedding is live). Empty when the parameters extension is off.
   */
  adHocNetParameters: Parameter[];

  // Actions
  setSelectedScenarioId: (scenarioId: string | null) => void;
  setAdHocScenario: (state: AdHocScenarioState | null) => void;
  setScenarioParameterValue: (identifier: string, value: string) => void;
  setInitialMarking: (placeId: string, marking: InitialPlaceMarking) => void;
  setParameterValue: (parameterId: string, value: string) => void;
  setDt: (dt: number) => void;
  setEngine: (engine: SimulationEngine) => void;
  setEventSolver: (solver: EventSolverConfig) => void;
  /**
   * Set the maximum simulation time in seconds.
   * Pass null to disable the time limit.
   */
  setMaxTime: (maxTime: number | null) => void;
  /**
   * Initialize the simulation with the given parameters.
   * Returns a Promise that resolves when initialization is complete (ready state)
   * or rejects if an error occurs during initialization.
   */
  initialize: (params: {
    seed: number;
    dt: number;
    maxFramesAhead?: number;
    batchSize?: number;
  }) => Promise<void>;
  run: () => void;
  pause: () => void;
  reset: () => void;
  /**
   * Update backpressure configuration at runtime.
   * Called by PlaybackProvider when playMode changes.
   */
  setBackpressure: (params: {
    maxFramesAhead?: number;
    batchSize?: number;
  }) => void;
  /**
   * Acknowledge receipt of frames up to the given frame number.
   * Used for backpressure control - the worker will pause computation
   * when it gets too far ahead of acknowledged frames.
   *
   * This should be called by PlaybackProvider based on playMode:
   * - viewOnly: never call ack
   * - computeBuffer: call ack when in the buffer zone (near end of available frames)
   * - computeMax: call ack every time new frames arrive
   */
  ack: (frameNumber: number) => void;
};

const DEFAULT_CONTEXT_VALUE: SimulationContextValue = {
  state: "NotRun",
  error: null,
  errorItemId: null,
  parameterValues: {},
  initialMarking: {},
  selectedScenarioId: null,
  scenarioParameterValues: {},
  compiledScenarioResult: null,
  scenarioCompilationErrors: null,
  adHocScenario: null,
  adHocNetParameters: [],
  dt: 0.01,
  maxTime: null,
  totalFramesStore: { get: () => 0, subscribe: () => () => {} },
  engine: "fixed-step",
  eventSolver: { kind: "fixed-step" },
  eventSimulation: null,
  getFrame: () => Promise.resolve(null),
  getAllFrames: () => Promise.resolve([]),
  getFramesInRange: () => Promise.resolve([]),
  setSelectedScenarioId: () => {},
  setAdHocScenario: () => {},
  setScenarioParameterValue: () => {},
  setInitialMarking: () => {},
  setParameterValue: () => {},
  setDt: () => {},
  setEngine: () => {},
  setEventSolver: () => {},
  setMaxTime: () => {},
  initialize: () => Promise.resolve(),
  run: () => {},
  pause: () => {},
  reset: () => {},
  setBackpressure: () => {},
  ack: () => {},
};

export const SimulationContext = createContext<SimulationContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
