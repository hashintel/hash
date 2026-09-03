/** The frame types the timeline's modules share. */
import type { ExperimentRecord } from "../../../../../../../../react/experiments/context";

export type MetricFrame = ExperimentRecord["metricFrames"][number];
export type ScalarMetricFrame = Extract<MetricFrame, { outputType: "scalar" }>;
export type DistributionMetricFrame = Extract<
  MetricFrame,
  { outputType: "distribution" }
>;
export type DistributionBins = DistributionMetricFrame["bins"];

export const isScalarMetricFrame = (
  frame: MetricFrame,
): frame is ScalarMetricFrame => frame.outputType === "scalar";

export const isDistributionMetricFrame = (
  frame: MetricFrame,
): frame is DistributionMetricFrame => frame.outputType === "distribution";

export const distributionFramesFrom = (
  frames: readonly MetricFrame[],
): DistributionMetricFrame[] => frames.filter(isDistributionMetricFrame);
