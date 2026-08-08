/**
 * What to compute — the portable half of an experiment.
 *
 * Deliberately closed, and deliberately plain data. No worker factory, no GPU
 * options, no abort signal, no callbacks. Anything a backend needs that is not
 * here describes *how* to compute rather than *what*, and belongs either to that
 * backend's construction (see `ExperimentBackend`) or to the per-call options of
 * `instantiate`.
 *
 * That single rule is what stops this type decaying into
 * `CreateMonteCarloExperimentConfig | CreateGpuMonteCarloExperimentConfig`. It
 * also keeps the request serializable, which is the property a future
 * out-of-process backend needs: for a remote backend this object is the request
 * body, so a function-valued field here would rule that backend out entirely.
 */
import type { PetrinautExtensionSettings } from "../extensions";
import type { HirArtifacts } from "../hir-runtime";
import type { InitialMarking } from "../simulation/api";
import type { MonteCarloMetricSpec } from "../simulation/monte-carlo/metrics/types";
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
   * Metrics to record.
   *
   * Expression metrics carry their compiled artifact, because a backend may need
   * to run them and cannot compile one itself — that needs the TypeScript
   * frontend, which is why `hirArtifacts` is here too rather than being derived.
   */
  readonly metricSpecs: readonly MonteCarloMetricSpec[];
  /**
   * Compiled user code for the net.
   *
   * Optional because a net with no user code needs none. Whether the HIR *trees*
   * must be included is declared per backend by `ExperimentBackend.needsHirTrees`
   * rather than inferred from a backend id, so a caller can compile once for
   * whichever backends it is about to ask.
   */
  readonly hirArtifacts?: HirArtifacts;
};
