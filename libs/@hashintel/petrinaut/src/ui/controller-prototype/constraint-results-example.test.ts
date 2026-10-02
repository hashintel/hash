import { describe, expect, it } from "vitest";

import {
  exampleFailingRuns,
  exampleResultFor,
} from "./constraint-results-example";

import type { ModelConstraint } from "../../react/controller-prototype/constraints";

const constraint = {
  id: "backorders_under_20",
  name: "Backorders stay under 20",
  time: "always",
  window: { kind: "between", from: 30, to: 360 },
  tolerance: 95,
  checks: [],
} as unknown as ModelConstraint;

describe("exampleFailingRuns", () => {
  const result = exampleResultFor("backorders_under_20")!;
  const runs = exampleFailingRuns(constraint, result);

  it("has one run per run that did not hold", () => {
    expect(runs).toHaveLength(result.runs - result.held);
  });

  it("starts with the result's first failing run and break", () => {
    expect(runs[0]).toMatchObject({
      run: result.firstFailingRun,
      day: result.firstBreak.day,
    });
  });

  it("ascends by distinct run, with days in the window and service level in range", () => {
    runs.forEach((run, index) => {
      if (index > 0) {
        expect(run.run).toBeGreaterThan(runs[index - 1]!.run);
        expect(run.day).toBeGreaterThanOrEqual(30);
        expect(run.day).toBeLessThanOrEqual(360);
      }
      expect(run.serviceLevel).toBeGreaterThanOrEqual(0.85);
      expect(run.serviceLevel).toBeLessThanOrEqual(0.95);
    });
  });

  it("is deterministic and empty when every run held", () => {
    expect(exampleFailingRuns(constraint, result)).toEqual(runs);
    expect(
      exampleFailingRuns(constraint, { ...result, held: result.runs }),
    ).toEqual([]);
  });
});
