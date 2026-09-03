/**
 * Frame types and guards shared by the metric timeline's modules: the
 * union of scalar and distribution frames an experiment streams, plus the
 * value formatting every surface uses.
 */
import type { ExperimentRecord } from "../../../../../../../../react/experiments/context";

export type MetricFrame = ExperimentRecord["metricFrames"][number];
export type ScalarMetricFrame = Extract<MetricFrame, { outputType: "scalar" }>;
export type DistributionMetricFrame = Extract<
  MetricFrame,
  { outputType: "distribution" }
>;
export type DistributionBins = DistributionMetricFrame["bins"];

export function isScalarMetricFrame(
  frame: MetricFrame,
): frame is ScalarMetricFrame {
  return frame.outputType === "scalar";
}

export function isDistributionMetricFrame(
  frame: MetricFrame,
): frame is DistributionMetricFrame {
  return frame.outputType === "distribution";
}

export function distributionFramesFrom(
  frames: readonly MetricFrame[],
): DistributionMetricFrame[] {
  return frames.filter(isDistributionMetricFrame);
}

export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}
