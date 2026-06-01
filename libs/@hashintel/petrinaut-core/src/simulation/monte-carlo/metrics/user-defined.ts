import {
  addAllMonteCarloMetricValues,
  createMonteCarloMetricHistogramAccumulator,
  createMonteCarloMetricNumericAccumulator,
} from "./accumulators";

import type { MonteCarloMetricNumericAccumulatorState } from "./accumulators";
import type {
  MonteCarloMetricRunStatus,
  MonteCarloMetricRunOutput,
  MonteCarloUserDefinedMetric,
  MonteCarloUserDefinedMetricConfig,
  MonteCarloUserDefinedMetricFrame,
  MonteCarloUserDefinedMetricSampleRuns,
} from "./types";

function shouldSampleRun(
  sampleRuns: MonteCarloUserDefinedMetricSampleRuns | undefined,
  status: MonteCarloMetricRunStatus,
): boolean {
  switch (sampleRuns ?? "active") {
    case "active":
      return status !== "complete" && status !== "error";
    case "completed":
      return status === "complete";
    case "all":
      return true;
  }
}

function normalizeSample(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function normalizeRunOutput(
  config: MonteCarloUserDefinedMetricConfig,
): MonteCarloMetricRunOutput {
  if (config.runOutput) {
    return config.runOutput;
  }

  return {
    type: "scalar",
    aggregateRuns: config.aggregateRuns ?? "mean",
  };
}

export function createMonteCarloUserDefinedMetric(
  config: MonteCarloUserDefinedMetricConfig,
): MonteCarloUserDefinedMetric {
  const label = config.label ?? config.id;
  const runOutput = normalizeRunOutput(config);
  const aggregateTime = config.aggregateTime ?? "none";
  const frames: MonteCarloUserDefinedMetricFrame[] = [];
  const frameCountAccumulator =
    createMonteCarloMetricNumericAccumulator("last");
  const scalarTimeAccumulator =
    aggregateTime === "none"
      ? null
      : createMonteCarloMetricNumericAccumulator(aggregateTime);
  const runTimeAccumulator =
    aggregateTime === "none"
      ? null
      : createMonteCarloMetricNumericAccumulator(aggregateTime);
  let scalarFrameCountState = frameCountAccumulator.empty();
  let scalarTimeState = scalarTimeAccumulator?.empty() ?? null;
  const runTimeStatesByRunIndex = new Map<
    number,
    MonteCarloMetricNumericAccumulatorState
  >();

  return {
    id: config.id,
    label,
    get frames() {
      return frames;
    },
    getLatestFrame: () => frames.at(-1) ?? null,
    clear: () => {
      frames.length = 0;
      scalarFrameCountState = frameCountAccumulator.empty();
      scalarTimeState = scalarTimeAccumulator?.empty() ?? null;
      runTimeStatesByRunIndex.clear();
    },
    observeFrame: (context) => {
      const runSamples: { runIndex: number; value: number }[] = [];

      context.forEachRunFrame((run) => {
        if (!shouldSampleRun(config.sampleRuns, run.status)) {
          return;
        }

        const sample = normalizeSample(
          config.measure({
            runIndex: run.runIndex,
            status: run.status,
            frame: run.frame,
          }),
        );

        if (sample !== null) {
          runSamples.push({ runIndex: run.runIndex, value: sample });
        }
      });

      const runValues = runSamples.map(({ value }) => value);

      if (runOutput.type === "distribution") {
        const distributionAccumulator =
          createMonteCarloMetricHistogramAccumulator(runOutput.binning);
        let distributionValues = runValues;
        let timeSampleCount = runValues.length;

        if (runTimeAccumulator) {
          for (const { runIndex, value } of runSamples) {
            const state =
              runTimeStatesByRunIndex.get(runIndex) ??
              runTimeAccumulator.empty();
            runTimeStatesByRunIndex.set(
              runIndex,
              runTimeAccumulator.add(state, value),
            );
          }

          distributionValues = runSamples.flatMap(({ runIndex }) => {
            const state = runTimeStatesByRunIndex.get(runIndex);
            if (!state) {
              return [];
            }

            const timeValue = runTimeAccumulator.read(state);
            return timeValue === null ? [] : [timeValue];
          });
          timeSampleCount = distributionValues.length;
        }

        frames.push({
          metricId: config.id,
          label,
          outputType: "distribution",
          frameNumber: context.frameNumber,
          time: context.time,
          value: null,
          frameValue: null,
          timeValue: null,
          bins: distributionAccumulator.read(
            addAllMonteCarloMetricValues(
              distributionAccumulator,
              distributionValues,
            ),
          ),
          runSampleCount: runValues.length,
          timeSampleCount,
        });
        return;
      }

      const aggregateRuns =
        runOutput.aggregateRuns ?? config.aggregateRuns ?? "mean";
      const runAccumulator =
        createMonteCarloMetricNumericAccumulator(aggregateRuns);
      const frameValue = runAccumulator.read(
        addAllMonteCarloMetricValues(runAccumulator, runValues),
      );
      if (frameValue !== null) {
        scalarFrameCountState = frameCountAccumulator.add(
          scalarFrameCountState,
          frameValue,
        );
        if (scalarTimeAccumulator && scalarTimeState) {
          scalarTimeState = scalarTimeAccumulator.add(
            scalarTimeState,
            frameValue,
          );
        }
      }

      const timeValue =
        scalarTimeAccumulator && scalarTimeState
          ? scalarTimeAccumulator.read(scalarTimeState)
          : null;

      frames.push({
        metricId: config.id,
        label,
        outputType: "scalar",
        frameNumber: context.frameNumber,
        time: context.time,
        value: timeValue ?? frameValue,
        frameValue,
        timeValue,
        runSampleCount: runValues.length,
        timeSampleCount: scalarFrameCountState.count,
      });
    },
  };
}
