/**
 * What to compute, as serializable data.
 *
 * Closed and plain: no worker factory, no GPU options, no abort signal, no
 * callbacks. Anything describing *how* to compute belongs to the backend's
 * construction (`ExperimentBackend`) or to the per-call options of `instantiate`.
 *
 * That rule keeps this from becoming
 * `CreateMonteCarloExperimentConfig | CreateGpuMonteCarloExperimentConfig`, and
 * keeps the request serializable. For an out-of-process backend this object is
 * the request body, which a function-valued field would prevent.
 */
import type { PetrinautExtensionSettings } from "../extensions";
import type { HirArtifacts } from "../hir-runtime";
import type { InitialMarking } from "../simulation/api";
import type { MonteCarloMetricSpec } from "../simulation/monte-carlo/metrics/types";
import type { MonteCarloRunConfig } from "../simulation/monte-carlo/types";
import type { SDCPN } from "../types/sdcpn";

/**
 * Per-run numeric parameter values, run-major.
 *
 * Every run carries every id: `values[run * ids.length + i]` is `ids[i]`'s
 * value for `run`, and `values.length` equals `runCount × ids.length`.
 * Backends lay per-run values out in one uniform buffer, so a ragged form
 * is unrepresentable by construction.
 */
export type ExperimentRunPlan = {
  /** Overridden net parameter variable names, sorted. */
  readonly ids: readonly string[];
  readonly values: Float64Array;
};

export type ExperimentRequest = {
  readonly sdcpn: SDCPN;
  readonly extensions?: PetrinautExtensionSettings;
  readonly initialMarking: InitialMarking;
  readonly parameterValues: Readonly<Record<string, string>>;
  readonly seed: number;
  readonly dt: number;
  readonly maxTime: number;
  readonly runCount: number;
  /**
   * Per-run overrides, indexed by global run index; `runs.length` must equal
   * `runCount` when present. Carries what `runPlan` cannot — per-run seeds,
   * markings, non-numeric values. At most one of `runs` and `runPlan` may be
   * present.
   */
  readonly runs?: readonly MonteCarloRunConfig[];
  /**
   * Per-run numeric parameter values as one typed array — the compact form
   * of `runs` for the only per-run override sweeps produce. A million runs
   * as `runs` is a million records of stringified numbers; as a plan it is
   * one buffer the GPU backend uploads directly and the CPU backend expands
   * into run configs at the worker-pool boundary. At most one of `runs` and
   * `runPlan` may be present.
   */
  readonly runPlan?: ExperimentRunPlan;
  /**
   * Metrics to record.
   *
   * Expression metrics carry their compiled artifact. A backend may need to run
   * them and cannot compile one itself: that needs the TypeScript frontend,
   * which is also why `hirArtifacts` is passed rather than derived.
   */
  readonly metricSpecs: readonly MonteCarloMetricSpec[];
  /**
   * Compiled user code for the net.
   *
   * Optional: a net with no user code needs none. Whether the HIR *trees* are
   * included is declared per backend by `ExperimentBackend.needsHirTrees`, so a
   * caller compiles once for whichever backends it is about to ask.
   */
  readonly hirArtifacts?: HirArtifacts;
};
