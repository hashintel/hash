import { describe, expect, it } from "vitest";

import {
  type ExperimentRecord,
  type ExperimentStatus,
  getExperimentElapsedMs,
  isExperimentActive,
  isTerminalExperimentStatus,
} from "./context";

function makeRecord(overrides: Partial<ExperimentRecord>): ExperimentRecord {
  return {
    id: "experiment",
    name: "Experiment",
    createdAt: 1_000,
    scenarioId: null,
    scenarioName: null,
    runCount: 1,
    seed: 1,
    dt: 1,
    maxTime: 10,
    status: "running",
    error: null,
    metricSpecs: [],
    computeBackend: "cpu",
    computeBackendFallbackReason: null,
    startedAt: null,
    finishedAt: null,
    progress: null,
    metricFrames: [],
    sweepBatches: [],
    parameterAxes: [],
    sweep: null,
    latestMetricFramesById: {},
    ...overrides,
  };
}

const ALL_STATUSES: ExperimentStatus[] = [
  "initializing",
  "running",
  "complete",
  "error",
  "cancelled",
];

describe("isTerminalExperimentStatus", () => {
  it("partitions every status into exactly active or terminal", () => {
    // The two must stay exact complements: `isExperimentActive` is defined as the
    // negation, and the provider stamps `finishedAt` off the terminal side.
    const terminal = ALL_STATUSES.filter(isTerminalExperimentStatus);
    const active = ALL_STATUSES.filter(
      (status) => !isTerminalExperimentStatus(status),
    );

    expect(terminal).toStrictEqual(["complete", "error", "cancelled"]);
    expect(active).toStrictEqual(["initializing", "running"]);

    for (const status of ALL_STATUSES) {
      expect(isExperimentActive(makeRecord({ status }))).toBe(
        !isTerminalExperimentStatus(status),
      );
    }
  });
});

describe("getExperimentElapsedMs", () => {
  it("measures against the live clock while still running", () => {
    const experiment = makeRecord({ startedAt: 5_000 });

    expect(getExperimentElapsedMs(experiment, 8_500)).toBe(3_500);
  });

  it("freezes at the finish time once finished", () => {
    const experiment = makeRecord({
      status: "complete",
      startedAt: 5_000,
      finishedAt: 6_250,
    });

    // The clock has moved a long way past the finish; the duration must not.
    expect(getExperimentElapsedMs(experiment, 900_000)).toBe(1_250);
  });

  it("reports null when stepping never began", () => {
    // An experiment that failed while compiling has no runtime to report, which
    // is different from a runtime of zero.
    const experiment = makeRecord({
      status: "error",
      error: "did not compile",
      startedAt: null,
      finishedAt: 6_000,
    });

    expect(getExperimentElapsedMs(experiment, 9_000)).toBeNull();
  });

  it("clamps rather than going negative if the clock moves backwards", () => {
    const experiment = makeRecord({ startedAt: 5_000 });

    expect(getExperimentElapsedMs(experiment, 4_000)).toBe(0);
  });
});
