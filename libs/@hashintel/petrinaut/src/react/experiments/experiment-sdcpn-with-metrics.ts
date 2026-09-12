import type { ExperimentMetricSpecInput } from "./context";
import type { SDCPN } from "@hashintel/petrinaut-core";

/**
 * The net an experiment compiles and runs: its metrics replaced by the
 * experiment's expression metrics, so they compile alongside the model's user
 * code in the language worker. The experiments provider builds the run's
 * request from it and the editor's GPU switch analyses the same net, so the
 * two cannot disagree about which metrics the shader is asked to compute.
 */
export const experimentSdcpnWithMetrics = (
  sdcpn: SDCPN,
  metricSpecs: readonly ExperimentMetricSpecInput[],
): SDCPN => ({
  ...sdcpn,
  metrics: metricSpecs
    .filter((spec) => spec.kind === "expression")
    .map((spec) => ({ id: spec.id, name: spec.label, code: spec.code })),
});
