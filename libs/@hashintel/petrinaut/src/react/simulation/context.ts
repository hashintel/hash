import { createContext } from "react";

import {
  type AdHocScenarioState,
  type CompiledScenarioResult,
  type EventSimulation,
  type ExperimentReader,
  type MonteCarloExperiment,
  type MonteCarloMetricSpec,
  type SimulationState as CoreSimulationState,
  type Parameter,
  type InitialMarking,
  type InitialPlaceMarking,
  type ScenarioCompilationError,
  type SimulationFrameReader,
  type SimulationFrameState,
  type ReadableStore,
} from "@hashintel/petrinaut-core";

import type { SimulationMode, SimulatorSelection } from "../simulators/context";

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
/**
 * What playback moves a viewed time over, whichever mode computed it: how
 * far the time may go, whether more is coming, and a way to ask for more.
 */
export type PlaybackSource = {
  readonly coverage: ReadableStore<{
    /** Recorded states to view. Zero until the first one arrives. */
    eventCount: number;
    /** Simulation time the viewed time may reach. */
    coveredTime: number;
  }>;
  readonly status: ReadableStore<CoreSimulationState>;
  /** Asks for the computation to cover `time`. A no-op when it runs freely. */
  demand(time: number): void;
};

/** The experiment a Stochastic simulation computes, as the editor holds it. */
export type StochasticRun = {
  readonly experiment: MonteCarloExperiment;
  /** The experiment's metric frames, read by time. */
  readonly reader: ExperimentReader;
  readonly runCount: number;
  readonly seed: number;
  readonly maxTime: number;
  /** The metrics the experiment computes: a token count per place. */
  readonly metricSpecs: readonly MonteCarloMetricSpec[];
  /** The simulator that computes it, as selected when it started. */
  readonly simulator: SimulatorSelection;
  /**
   * True once something else took the experiment over. Discarding the
   * simulation then lets go of it without stopping it.
   */
  readonly kept: boolean;
};

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
   * Maximum simulation time in seconds.
   * When the simulation reaches this time, it will be paused.
   * If null, the simulation runs until no transitions are enabled.
   */
  maxTime: number | null;
  /**
   * Events the run has recorded so far, the initial state included. A store
   * rather than a number, so the context value holds still while a run
   * streams and only what shows the count renders on each batch.
   */
  totalFramesStore: ReadableStore<number>;
  /**
   * What Play computes: one run, or many. Changing it discards the current
   * run.
   */
  mode: SimulationMode;
  /**
   * The simulator the next run is computed by in the current mode, with its
   * parameter values. Each mode keeps its own. Changing either discards the
   * current run.
   */
  simulatorSelection: SimulatorSelection;
  /** Runs a Stochastic simulation computes. */
  runs: number;
  /** The Stochastic simulation's experiment while one exists; null otherwise. */
  stochasticRun: StochasticRun | null;
  /**
   * What playback moves over: the run's events in Quick mode, the
   * experiment's samples in Stochastic mode. Null without a run.
   */
  playbackSource: PlaybackSource | null;
  /**
   * The Quick Simulation's run while one exists; null otherwise. Playback
   * reads its trace through it.
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
  setMode: (mode: SimulationMode) => void;
  setRuns: (runs: number) => void;
  /**
   * Marks the Stochastic simulation's experiment as taken over by a caller:
   * it stays on the canvas, and discarding the simulation no longer stops
   * it.
   */
  keepStochasticRun: () => void;
  /** Switches simulator, restoring the parameter values last used with it. */
  selectSimulator: (simulatorId: string) => void;
  setSimulatorParameter: (
    key: string,
    value: number | boolean | string,
  ) => void;
  /**
   * Set the maximum simulation time in seconds.
   * Pass null to disable the time limit.
   */
  setMaxTime: (maxTime: number | null) => void;
  /**
   * Starts what the mode computes on the selected simulator: a run, or an
   * experiment. Resolves once it is ready to run, and rejects with the
   * reason when the simulator refuses or the net does not compile.
   */
  initialize: (params: { seed: number }) => Promise<void>;
  run: () => void;
  pause: () => void;
  reset: () => void;
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
  maxTime: null,
  totalFramesStore: { get: () => 0, subscribe: () => () => {} },
  mode: "quick",
  simulatorSelection: { simulatorId: "", parameters: {} },
  runs: 100,
  stochasticRun: null,
  playbackSource: null,
  eventSimulation: null,
  getFrame: () => Promise.resolve(null),
  getAllFrames: () => Promise.resolve([]),
  getFramesInRange: () => Promise.resolve([]),
  setSelectedScenarioId: () => {},
  setAdHocScenario: () => {},
  setScenarioParameterValue: () => {},
  setInitialMarking: () => {},
  setParameterValue: () => {},
  setMode: () => {},
  setRuns: () => {},
  keepStochasticRun: () => {},
  selectSimulator: () => {},
  setSimulatorParameter: () => {},
  setMaxTime: () => {},
  initialize: () => Promise.resolve(),
  run: () => {},
  pause: () => {},
  reset: () => {},
};

export const SimulationContext = createContext<SimulationContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
