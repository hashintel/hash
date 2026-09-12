import { describe, expect, it } from "vitest";

import { metricFailure } from "./metric-failure";

const metricIds = ["metric_infected", "metric_recovered"];
const metricSpecs = [{ id: "metric_recovered", label: "Recovered at the end" }];

describe("metricFailure", () => {
  it("is null while every metric stayed finite", () => {
    expect(
      metricFailure({
        metricIds,
        metricSpecs,
        metricErrors: [0, 0],
        runCount: 128,
      }),
    ).toBeNull();
    expect(
      metricFailure({ metricIds, metricSpecs, metricErrors: [], runCount: 8 }),
    ).toBeNull();
  });

  it("names the first halted metric by its label with the attempt's run count", () => {
    expect(
      metricFailure({
        metricIds,
        metricSpecs,
        metricErrors: [0, 3],
        runCount: 128,
      }),
    ).toBe(
      'Metric "Recovered at the end" returned a non-finite value in 3 of 128 runs, expected a finite number.',
    );
  });

  it("falls back to the metric's id without a spec for it", () => {
    expect(
      metricFailure({
        metricIds,
        metricSpecs,
        metricErrors: [2, 3],
        runCount: 10_000,
      }),
    ).toBe(
      'Metric "metric_infected" returned a non-finite value in 2 of 10000 runs, expected a finite number.',
    );
  });
});
