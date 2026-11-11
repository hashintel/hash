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
  type RunClock,
  type ScenarioCompilationError,
  type SimulationFrameReader,
  type SimulationFrameState,
  type ReadableStore,
} from "@hashintel/petrinaut-core";

import { constantStore } from "../use-store";

import type { SimulationMode, SimulatorSelection } from "../simulators/context";

// The frame and marking types of the context's own fields, for its consumers.
export type {
  InitialMarking,
  InitialPlaceMarking,
  SimulationFrameReader,
  SimulationFrameState,
};

/**
 * Where a simulation stands, as the editor shows it. The core's own state
 * has two more values, `Initializing` and `Ready`, which the provider maps
 * to `NotRun` and `Paused`.
 */
export type SimulationState =
  | "NotRun"
  | "Running"
  | "Complete"
  | "Error"
  | "Paused";

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
  /** The spacing of the experiment's samples, in simulated seconds. */
  readonly samplePeriod: number;
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
   * What a position of the run counts in the current mode: simulated
   * seconds, or the steps of an untimed net's Quick Simulation, which has no
   * clock. Read from the run while one exists, and from the net before.
   */
  clock: RunClock;
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

  // Frame access. A frame is the state an event of the run recorded, read
  // from the trace the host already holds.
  /**
   * The frame at an index, or null when the index is out of bounds or no
   * run exists.
   */
  getFrame: (frameIndex: number) => Promise<SimulationFrameReader | null>;

  /**
   * The frames from `startIndex` (inclusive) to `endIndex` (exclusive), or
   * to the last one when `endIndex` is left out.
   */
  getFramesInRange: (
    startIndex: number,
    endIndex?: number,
  ) => Promise<SimulationFrameReader[]>;

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
   * Hands the Stochastic simulation's experiment to a caller, and returns
   * it: it stays on the canvas, and discarding the simulation no longer
   * stops it. When its new owner disposes it before it finished, the canvas
   * lets go of it too. Null when there is none to hand over, or it was
   * handed over already.
   */
  keepStochasticRun: () => MonteCarloExperiment | null;
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
   * experiment. Resolves true once it is ready to run, and false when a
   * change of configuration overtook the start and nothing was installed.
   * Rejects with the reason when the simulator refuses or the net does not
   * compile.
   */
  initialize: (params: { seed: number }) => Promise<boolean>;
  run: () => void;
  pause: () => void;
  reset: () => void;
};

/** The value outside a `SimulationProvider`: no run, and actions that do nothing. */
export const DEFAULT_SIMULATION_CONTEXT: SimulationContextValue = {
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
  totalFramesStore: constantStore(0),
  mode: "quick",
  clock: "time",
  simulatorSelection: { simulatorId: "", parameters: {} },
  runs: 100,
  stochasticRun: null,
  playbackSource: null,
  eventSimulation: null,
  getFrame: () => Promise.resolve(null),
  getFramesInRange: () => Promise.resolve([]),
  setSelectedScenarioId: () => {},
  setAdHocScenario: () => {},
  setScenarioParameterValue: () => {},
  setInitialMarking: () => {},
  setParameterValue: () => {},
  setMode: () => {},
  setRuns: () => {},
  keepStochasticRun: () => null,
  selectSimulator: () => {},
  setSimulatorParameter: () => {},
  setMaxTime: () => {},
  initialize: () => Promise.resolve(false),
  run: () => {},
  pause: () => {},
  reset: () => {},
};

export const SimulationContext = createContext<SimulationContextValue>(
  DEFAULT_SIMULATION_CONTEXT,
);
