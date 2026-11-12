import { describe, expect, it } from "vitest";

import { sirModel } from "../../examples";
import { compileHirArtifacts } from "../../hir/compile";
import { createMonteCarloUserDefinedMetricConfigsFromSpecs } from "../monte-carlo/metrics/specs";
import { createMonteCarloUserDefinedMetric } from "../monte-carlo/metrics/user-defined";
import { createMonteCarloSimulator } from "../monte-carlo/monte-carlo-simulator";
import {
  appendMetricFrames,
  createEmptyMetricsState,
} from "../monte-carlo/runtime/experiment-stores";
import {
  countStatisticsOfBins,
  createExperimentReader,
  placeCountMetricId,
  placeCountMetricSpecs,
} from "./experiment-reader";

import type { MonteCarloExperimentMetrics } from "../monte-carlo/runtime/experiment-stores";

const sdcpn = sirModel.petriNetDefinition;
const dt = 0.1;
const runCount = 30;

/** An experiment stepped in this thread, publishing as its handle would. */
const stepExperiment = () => {
  const metrics = createMonteCarloUserDefinedMetricConfigsFromSpecs(
    placeCountMetricSpecs(sdcpn.places),
    sdcpn,
  ).map((config) => createMonteCarloUserDefinedMetric(config));
  const simulator = createMonteCarloSimulator({
    sdcpn,
    hirArtifacts: compileHirArtifacts(sdcpn).artifacts,
    initialMarking: Object.fromEntries(
      sdcpn.places.map((place, index) => [place.id, index === 0 ? 60 : 3]),
    ),
    parameterValues: {},
    seed: 5,
    dt,
    maxTime: 4,
    runCount,
    metrics,
  });
  let state: MonteCarloExperimentMetrics = createEmptyMetricsState();
  const sent = new Map<string, number>();
  const publish = () => {
    state = appendMetricFrames(
      state,
      metrics.flatMap((metric) => {
        const from = sent.get(metric.id) ?? 0;
        sent.set(metric.id, metric.frames.length);
        return metric.frames.slice(from);
      }),
    );
  };
  publish();
  return {
    simulator,
    store: { get: () => state, subscribe: () => () => {} },
    step: () => {
      const result = simulator.advanceAll();
      publish();
      return result;
    },
  };
};

describe("countStatisticsOfBins", () => {
  it("gives the mean and spread of the runs the bins count", () => {
    expect(
      countStatisticsOfBins([
        [2, 1],
        [4, 3],
      ]),
    ).toMatchObject({
      runCount: 4,
      mean: 3.5,
      standardDeviation: Math.sqrt(0.75),
    });
    expect(countStatisticsOfBins([])).toBeNull();
  });
});

describe("createExperimentReader", () => {
  it("reads each place's count across runs at the viewed time, as the runs hold it", () => {
    const experiment = stepExperiment();
    const reader = createExperimentReader(experiment.store);

    for (let sample = 1; ; sample++) {
      const result = experiment.step();
      // A time inside a sample interval reads the sample before it.
      const viewedTime = sample * dt + dt / 3;
      for (const place of sdcpn.places) {
        const counts = Array.from(
          { length: runCount },
          (_, runIndex) =>
            experiment.simulator.getRunSnapshot(runIndex).placeTokenCounts[
              place.id
            ] ?? 0,
        );
        const mean = counts.reduce((sum, count) => sum + count, 0) / runCount;
        const spread = Math.sqrt(
          counts.reduce((sum, count) => sum + (count - mean) ** 2, 0) /
            runCount,
        );
        const statistics = reader.placeCountAt(place.id, viewedTime);
        expect(statistics?.runCount).toBe(runCount);
        expect(statistics?.mean).toBeCloseTo(mean, 9);
        expect(statistics?.standardDeviation).toBeCloseTo(spread, 9);
      }
      expect(reader.coveredTime()).toBeCloseTo(sample * dt, 9);
      if (result.allFinished) {
        // Every run still counts at the last sample, finished or not.
        expect(sample).toBe(40);
        break;
      }
    }
  });

  it("answers nothing before the first sample and holds the last one after the end", () => {
    const experiment = stepExperiment();
    const reader = createExperimentReader(experiment.store);
    const [place] = sdcpn.places;
    expect(reader.placeCountAt(place!.id, -1)).toBeNull();
    expect(reader.placeCountAt(place!.id, 0)?.mean).toBe(60);
    expect(reader.coveredTime()).toBe(0);

    experiment.step();
    experiment.step();
    expect(reader.coveredTime()).toBeCloseTo(0.2, 9);
    expect(reader.placeCountAt(place!.id, 99)).toBe(
      reader.placeCountAt(place!.id, 0.2),
    );
    expect(reader.metricFrames(placeCountMetricId(place!.id))).toHaveLength(3);
    expect(reader.metricFrames("unknown")).toEqual([]);
  });

  it("starts over when the store replaces its frames instead of growing", () => {
    const experiment = stepExperiment();
    experiment.step();
    let state = experiment.store.get();
    const reader = createExperimentReader({
      get: () => state,
      subscribe: () => () => {},
    });
    const [place] = sdcpn.places;
    const metricId = placeCountMetricId(place!.id);
    expect(reader.metricFrames(metricId)).toHaveLength(2);

    // A backend that refines its samples publishes a new array.
    const refined = state.frames
      .filter((frame) => frame.metricId === metricId && frame.frameNumber === 0)
      .map((frame) => ({ ...frame, time: 0 }));
    state = { frames: refined, latestByMetricId: {} };
    expect(reader.metricFrames(metricId)).toHaveLength(1);
    expect(reader.metricFrameAt(metricId, 5)).toBe(refined[0]);
  });

  it("starts over when an earlier frame is replaced and the last one is kept", () => {
    const experiment = stepExperiment();
    experiment.step();
    let state = experiment.store.get();
    const reader = createExperimentReader({
      get: () => state,
      subscribe: () => () => {},
    });
    const [place] = sdcpn.places;
    const metricId = placeCountMetricId(place!.id);
    const replacedAt = state.frames.findIndex(
      (frame) => frame.metricId === metricId && frame.frameNumber === 0,
    );
    expect(replacedAt).toBeLessThan(state.frames.length - 1);
    expect(reader.metricFrameAt(metricId, 0)).toBe(state.frames[replacedAt]);

    // A backend that refines an earlier sample publishes an array as long
    // as the one before, ending in the same frame.
    const refined = { ...state.frames[replacedAt]!, runSampleCount: 999 };
    state = {
      ...state,
      frames: state.frames.map((frame, at) =>
        at === replacedAt ? refined : frame,
      ),
    };
    expect(reader.metricFrameAt(metricId, 0)).toBe(refined);
  });
});
