import { describe, expect, it } from "vitest";

import { experimentProgressPercent } from "./experiment-progress";

describe("experimentProgressPercent", () => {
  const progress = {
    activeRuns: 0,
    advancedRuns: 0,
    allFinished: false,
    completedRuns: 0,
    erroredRuns: 0,
    frameNumber: 45,
    runCount: 100,
    time: 45,
  };

  it("tracks simulated time for a plain experiment", () => {
    expect(
      experimentProgressPercent({
        sweep: null,
        progress,
        runCount: 100,
        maxTime: 180,
      }),
    ).toBe(25);
  });

  it("is zero before any progress or with no time horizon", () => {
    expect(
      experimentProgressPercent({
        sweep: null,
        progress: null,
        runCount: 100,
        maxTime: 180,
      }),
    ).toBe(0);
    expect(
      experimentProgressPercent({
        sweep: null,
        progress,
        runCount: 100,
        maxTime: 0,
      }),
    ).toBe(0);
  });

  it("tracks the selection's sampled runs for a sweep, capped at 100", () => {
    const sweep = {
      selection: {},
      runsCompleted: 25,
      runsSampled: 61,
      runTarget: 100,
      computing: true,
    };
    expect(
      experimentProgressPercent({
        sweep,
        progress,
        runCount: 100,
        maxTime: 180,
      }),
    ).toBe(61);
    expect(
      experimentProgressPercent({
        sweep: { ...sweep, runsSampled: 150 },
        progress,
        runCount: 100,
        maxTime: 180,
      }),
    ).toBe(100);
    expect(
      experimentProgressPercent({ sweep, progress, runCount: 0, maxTime: 180 }),
    ).toBe(0);
  });
});
