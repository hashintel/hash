import type { PetrinautExtensionSettings } from "../../../extensions";
import type { HirArtifacts } from "../../../hir-runtime";
import type { SDCPN } from "../../../types/sdcpn";
import type { InitialMarking } from "../../api";
import type { SimulationCompletionReason } from "../../engine/compute-next-frame";
import type { MonteCarloRunState } from "../../monte-carlo/internal-types";
import type { MonteCarloRunConfig } from "../../monte-carlo/types";

/** What every stepper is built from, whichever simulator it belongs to. */
export type RunStepperConfig = {
  sdcpn: SDCPN;
  extensions?: PetrinautExtensionSettings;
  initialMarking: InitialMarking;
  parameterValues: Record<string, string>;
  seed: number;
  /** Simulation time the run stops at. Null runs until deadlock or stop. */
  maxTime: number | null;
  hirArtifacts?: HirArtifacts;
  /**
   * The run's position among the runs of an experiment; its seed derives
   * from `seed` and this index. A single run is index 0.
   */
  runIndex?: number;
  /** The run's own parameter values and marking, as a sweep assigns them. */
  runConfig?: MonteCarloRunConfig;
};

export type RunAdvance = {
  /** Simulation time after the advance. */
  time: number;
  /**
   * Why the advance stopped: transitions fired, the simulator wants the
   * state kept, or it reached the time it was told to stop at with nothing
   * to record.
   */
  kind: "firing" | "reference" | "stopped";
  /** Transitions that fired at `time`, in net order. Empty unless `kind` is `firing`. */
  firedTransitionIds: readonly string[];
  completion: SimulationCompletionReason | null;
  /** The engine's error message when the advance failed; the run is over. */
  error: string | null;
};

/**
 * One run of one simulator, as the worker drives it.
 *
 * A stepper decides how time advances and which states are worth keeping.
 * It does not encode them: the run's state stays in the buffers every
 * stepper shares, where a trace recorder turns it into events and a metric
 * reads it in place.
 */
export interface RunStepper {
  /** The run's state. Read between advances; the buffers are reused. */
  readonly run: MonteCarloRunState;
  /** Simulation time the run has reached. */
  readonly time: number;
  /**
   * Advances to the next state worth recording, and never past `stopAt`.
   *
   * `stopAt` is for a caller that has to see the run at times of its own,
   * as sampling on a grid does. A stepper that draws random numbers per
   * span draws differently when stopped, so a run is only reproducible for
   * the same sequence of stops; a caller that only wants the next recorded
   * state leaves `stopAt` out.
   */
  advance(stopAt?: number): RunAdvance;
  /** Per-place values to publish with the next recorded state, by name. */
  diagnostics?(): Readonly<Record<string, Float64Array>>;
}

/** A simulator's parameter values as a message carries them. */
export type StepperParameters = Readonly<
  Record<string, number | boolean | string>
>;

/** A positive, finite number parameter, or an error naming the simulator and the key. */
export const positiveNumberParameter = (
  simulatorId: string,
  parameters: StepperParameters,
  key: string,
): number => {
  const value = parameters[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(
      `Simulator "${simulatorId}" parameter "${key}" should be a number above 0, received ${String(value)}`,
    );
  }
  return value;
};

/** Transitions flagged as fired in the run's current frame, in net order. */
export const firedTransitionIds = (run: MonteCarloRunState): string[] => {
  const { transitionIds } = run.simulation.frameLayout;
  const fired: string[] = [];
  for (const [index, flag] of run.currentFrame.transitionFiredFlags.entries()) {
    if (flag === 1) {
      fired.push(transitionIds[index]!);
    }
  }
  return fired;
};
