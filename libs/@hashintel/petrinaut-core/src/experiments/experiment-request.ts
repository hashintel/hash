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
   * `runCount` when present. A sweep over parameter ranges uses this to give
   * every run its own drawn parameter values. Backends whose compiled form
   * bakes parameters in (the WebGPU shader) refuse requests that carry it.
   */
  readonly runs?: readonly MonteCarloRunConfig[];
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
