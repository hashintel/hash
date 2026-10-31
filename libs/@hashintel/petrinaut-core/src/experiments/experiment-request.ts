/**
 * What to compute, as plain data.
 *
 * Closed: no worker factory, no GPU options, no abort signal, no callbacks.
 * Anything describing *how* to compute belongs to the backend's construction
 * (`ExperimentBackend`) or to the per-call options of `instantiate`. Every
 * field survives structured cloning, so the request can cross a worker or
 * process boundary as-is; `runPlan.values` is a `Float64Array`, which JSON
 * alone does not carry.
 */
import type { PetrinautExtensionSettings } from "../extensions";
import type { HirArtifacts } from "../hir-runtime";
import type { InitialMarking } from "../simulation/api";
import type { MonteCarloMetricSpec } from "../simulation/monte-carlo/metrics/types";
import type { SDCPN } from "../types/sdcpn";

/**
 * Per-run numeric parameter values, run-major.
 *
 * Every run carries every id: `values[run * ids.length + i]` is `ids[i]`'s
 * value for `run`, and `values.length` equals `runCount × ids.length`.
 * Backends lay per-run values out in one uniform buffer, so a ragged form
 * is unrepresentable by construction. A boolean parameter rides as `1`/`0`;
 * a backend feeding the engine turns those back into `"true"`/`"false"`.
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
   * Per-run numeric parameter values as one typed array, the only per-run
   * override sweeps produce. A million runs are one buffer the GPU backend
   * uploads directly and the CPU backend expands into run configs at the
   * worker-pool boundary.
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
