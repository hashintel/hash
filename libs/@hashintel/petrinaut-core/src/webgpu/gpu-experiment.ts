/**
 * One-shot GPU experiment: run it, get the frames back.
 *
 * The React provider uses `gpu-experiment-handle.ts` instead, which wraps the
 * same machinery in the observable `MonteCarloExperiment` contract. This flatter
 * API exists for benchmarks, scripts and tests that want the result without a
 * store to subscribe to.
 */
import { requestGpuExperimentBackend } from "./backend";
import { toGpuMetricFrames, toGpuMetricSpecs } from "./gpu-metric-frames";
import { runGpuExperiment } from "./runner";

import type { PetrinautExtensionSettings } from "../extensions";
import type { HirArtifacts } from "../hir-runtime";
import type { InitialMarking } from "../simulation/api";
import type {
  MonteCarloMetricSpec,
  MonteCarloUserDefinedMetricFrame,
} from "../simulation/monte-carlo/metrics";
import type { SDCPN } from "../types/sdcpn";

export type GpuExperimentConfig = {
  sdcpn: SDCPN;
  /** Compiled artifacts for this net, carrying the HIR the shader is built from. */
  hirArtifacts: HirArtifacts;
  extensions?: PetrinautExtensionSettings;
  initialMarking: InitialMarking;
  parameterValues: Record<string, string>;
  seed: number;
  dt: number;
  maxTime: number;
  runCount: number;
  metricSpecs: readonly MonteCarloMetricSpec[];
};

export type GpuExperimentOutcome =
  | {
      ran: true;
      frames: MonteCarloUserDefinedMetricFrame[];
      dispatchMs: number;
      deviceInfo: string;
      /** Non-fatal notes, e.g. histogram saturation. */
      warnings: string[];
    }
  | { ran: false; reason: string };

/**
 * Runs one experiment on the GPU, or reports why it could not.
 *
 * Never throws for an unsupported net or a missing device — the caller is
 * expected to fall back to the CPU and surface `reason`.
 */
export async function runGpuMonteCarloExperiment(
  config: GpuExperimentConfig,
  onProgress?: (progress: { framesDone: number; frameLimit: number }) => void,
): Promise<GpuExperimentOutcome> {
  const metrics = toGpuMetricSpecs(config.metricSpecs);
  if (!metrics.ok) {
    return { ran: false, reason: metrics.reason };
  }

  const backend = await requestGpuExperimentBackend({
    sdcpn: config.sdcpn,
    hirArtifacts: config.hirArtifacts,
    extensions: config.extensions,
    parameterValues: config.parameterValues,
    dt: config.dt,
    metrics: metrics.metrics,
    odeMethod: "rk4",
    initialMarking: config.initialMarking,
  });
  if (!backend.supported) {
    return { ran: false, reason: backend.reason };
  }

  // Uncoloured places take a plain count; a typed place's initial marking is an
  // array of token records, whose length is the count the shader needs.
  const placeCounts = backend.profile.places.map((place) => {
    const marking = config.initialMarking[place.id];
    if (typeof marking === "number") {
      return marking;
    }
    return Array.isArray(marking) ? marking.length : 0;
  });

  const frameLimit = Math.max(1, Math.round(config.maxTime / config.dt));
  const run = await runGpuExperiment(backend.handle, backend.shader, {
    runCount: config.runCount,
    frameLimit,
    framesPerDispatch: backend.framesPerDispatch,
    seed: config.seed,
    initial: { placeCounts },
    onChunk: onProgress,
  });
  if (!run.ok) {
    return { ran: false, reason: run.reason };
  }

  const warnings = [...backend.warnings];
  if (run.result.saturatedSamples > 0) {
    // The top histogram bin saturates, so the distribution's tail is wrong past
    // it. Saying so beats presenting a clipped distribution as fact.
    warnings.push(
      `${run.result.saturatedSamples} samples exceeded the histogram's largest bin and were clamped, so the upper tail of this distribution is not accurate.`,
    );
  }

  return {
    ran: true,
    frames: toGpuMetricFrames(run.result.frames, config.metricSpecs, config.dt),
    dispatchMs: run.result.dispatchMs,
    deviceInfo: backend.handle.info,
    warnings,
  };
}
