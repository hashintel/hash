import type { MonteCarloRunState } from "./internal-types";
import type { MonteCarloRunConfig, MonteCarloSimulatorConfig } from "./types";

/**
 * One run of an experiment, advanced by something other than the simulator's
 * own fixed step.
 *
 * The simulator still owns what it always did: which runs exist, when they
 * are sampled, and what the metrics read. A driver decides how a run gets
 * from one sample time to the next.
 */
export type MonteCarloRunDriver = {
  /** The run's state, in the buffers the metrics read. */
  readonly run: MonteCarloRunState;
  /** Simulation time the run has reached. */
  readonly time: number;
  /**
   * Brings the run to `time`, or to its end when that comes first. The run's
   * status tells the simulator which.
   */
  advanceTo(time: number): void;
};

/** Builds the driver of run `index` of the simulator's runs. */
export type MonteCarloRunDriverFactory = (
  config: MonteCarloSimulatorConfig,
  runConfig: MonteCarloRunConfig | undefined,
  index: number,
) => MonteCarloRunDriver;

/** Which simulator advances an experiment's runs, as a message carries it. */
export type MonteCarloSimulatorSelection = {
  id: string;
  parameters: Readonly<Record<string, number | boolean | string>>;
};
