import type { MonteCarloUserDefinedMetricFrame } from "@hashintel/petrinaut-core";

/** What one backend streamed for a request, and how long the run took. */
export type BackendRun = {
  frames: readonly MonteCarloUserDefinedMetricFrame[];
  ms: number;
};

/** How far the two backends agree on one metric. */
export type ParityReport = {
  /** `<model> · <measure>`, one row per measured metric. */
  model: string;
  runCount: number;
  /** The frames both backends produced for the metric. */
  frames: number;
  cpuMs: number;
  gpuMs: number;
  /** Mean over the sampled frames of |cpuMean - gpuMean| / max(|cpuMean|, 1). */
  meanRelativeDifference: number;
  /** The worst frame's relative difference. */
  maxRelativeDifference: number;
  /**
   * Kolmogorov–Smirnov statistic between the distributions of the last frame
   * both backends sampled.
   */
  finalKs: number;
};

/**
 * A model that could not be compared. `cpuMs` is set when the CPU run
 * completed and the GPU could not follow, as in a browser without WebGPU.
 */
export type ParityFailure = { model: string; cpuMs?: number; error: string };

export type ParityRow = ParityReport | ParityFailure;

/** The mean of a frame: its scalar, or the mean of its distribution. */
export const frameMean = (
  frame: MonteCarloUserDefinedMetricFrame,
): number | null => {
  if (frame.outputType !== "distribution") {
    return frame.value;
  }
  let weight = 0;
  let sum = 0;
  for (const [value, frequency] of frame.bins) {
    weight += frequency;
    sum += value * frequency;
  }
  return weight > 0 ? sum / weight : null;
};

/**
 * The Kolmogorov–Smirnov statistic of two distribution frames: the largest
 * gap between their cumulative distributions, from 0 (identical) to 1
 * (disjoint). `NaN` when either frame is a scalar or holds no samples.
 */
export const ksStatistic = (
  left: MonteCarloUserDefinedMetricFrame,
  right: MonteCarloUserDefinedMetricFrame,
): number => {
  if (
    left.outputType !== "distribution" ||
    right.outputType !== "distribution"
  ) {
    return Number.NaN;
  }
  const leftBins = new Map(left.bins);
  const rightBins = new Map(right.bins);
  const total = (bins: Map<number, number>) =>
    [...bins.values()].reduce((sum, frequency) => sum + frequency, 0);
  const leftTotal = total(leftBins);
  const rightTotal = total(rightBins);
  if (leftTotal === 0 || rightTotal === 0) {
    return Number.NaN;
  }
  const values = [...new Set([...leftBins.keys(), ...rightBins.keys()])].sort(
    (a, b) => a - b,
  );

  let leftCumulative = 0;
  let rightCumulative = 0;
  let statistic = 0;
  for (const value of values) {
    leftCumulative += leftBins.get(value) ?? 0;
    rightCumulative += rightBins.get(value) ?? 0;
    statistic = Math.max(
      statistic,
      Math.abs(leftCumulative / leftTotal - rightCumulative / rightTotal),
    );
  }
  return statistic;
};

/** The frames of one metric by frame number. */
const framesOf = (run: BackendRun, metricId: string) =>
  new Map(
    run.frames
      .filter((frame) => frame.metricId === metricId)
      .map((frame) => [frame.frameNumber, frame]),
  );

/**
 * Compares what the two backends streamed for one metric, over the frames
 * both produced. The backends use different random generators, so the
 * comparison is of statistics: the frame means, and the last distributions.
 * A frame one backend took no sample for has no mean and is left out, as the
 * final frame is for a metric that samples the runs still stepping.
 */
export const compareRuns = ({
  label,
  metricId,
  runCount,
  cpu,
  gpu,
}: {
  label: string;
  metricId: string;
  runCount: number;
  cpu: BackendRun;
  gpu: BackendRun;
}): ParityReport => {
  const gpuFrames = framesOf(gpu, metricId);
  const common = [...framesOf(cpu, metricId)]
    .flatMap(([frameNumber, cpuFrame]) => {
      const gpuFrame = gpuFrames.get(frameNumber);
      return gpuFrame === undefined
        ? []
        : [{ frameNumber, cpuFrame, gpuFrame }];
    })
    .sort((a, b) => a.frameNumber - b.frameNumber);

  const sampled = common.flatMap(({ cpuFrame, gpuFrame }) => {
    const cpuMean = frameMean(cpuFrame);
    const gpuMean = frameMean(gpuFrame);
    return cpuMean === null || gpuMean === null
      ? []
      : [
          {
            cpuFrame,
            gpuFrame,
            difference:
              Math.abs(cpuMean - gpuMean) / Math.max(Math.abs(cpuMean), 1),
          },
        ];
  });
  const last = sampled.at(-1);

  return {
    model: label,
    runCount,
    frames: common.length,
    cpuMs: Math.round(cpu.ms),
    gpuMs: Math.round(gpu.ms),
    meanRelativeDifference:
      sampled.length > 0
        ? sampled.reduce((sum, { difference }) => sum + difference, 0) /
          sampled.length
        : Number.NaN,
    maxRelativeDifference: sampled.reduce(
      (worst, { difference }) => Math.max(worst, difference),
      0,
    ),
    finalKs:
      last === undefined
        ? Number.NaN
        : ksStatistic(last.cpuFrame, last.gpuFrame),
  };
};
