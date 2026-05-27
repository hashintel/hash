import { describe, expect, it } from "vitest";

import { createInlineCoreSandbox } from "./inline";

import type { Metric } from "../types/sdcpn";

const buildMetric = (overrides: Partial<Metric> = {}): Metric => ({
  id: "m1",
  name: "Test",
  code: "return 0;",
  ...overrides,
});

describe("createInlineCoreSandbox", () => {
  it("creates a metric evaluator that returns the compiled value", async () => {
    const sandbox = createInlineCoreSandbox();
    try {
      const evaluator = await sandbox.createMetricEvaluator(
        buildMetric({ code: "return state.places.A.count;" }),
      );
      const result = await evaluator.evaluate({
        places: { A: { count: 42, tokens: [] } },
      });
      expect(result).toBe(42);
    } finally {
      sandbox.dispose();
    }
  });

  it("`evaluateBatch` returns per-state results without throwing", async () => {
    const sandbox = createInlineCoreSandbox();
    try {
      const evaluator = await sandbox.createMetricEvaluator(
        buildMetric({ code: "return state.places.A.count * 2;" }),
      );
      const results = await evaluator.evaluateBatch([
        { places: { A: { count: 1, tokens: [] } } },
        { places: { A: { count: 5, tokens: [] } } },
      ]);
      expect(results).toEqual([2, 10]);
    } finally {
      sandbox.dispose();
    }
  });

  it("`evaluateBatch` captures per-row errors instead of throwing", async () => {
    const sandbox = createInlineCoreSandbox();
    try {
      const evaluator = await sandbox.createMetricEvaluator(
        buildMetric({ code: "return state.places.A.count;" }),
      );
      const results = await evaluator.evaluateBatch([
        { places: { A: { count: 1, tokens: [] } } },
        // Missing `A` so the metric body throws — the error is surfaced
        // per row rather than rejecting the whole batch.
        { places: {} },
      ]);
      expect(results[0]).toBe(1);
      const secondRow = results[1];
      expect(typeof secondRow).toBe("object");
      expect(secondRow).toHaveProperty("error");
    } finally {
      sandbox.dispose();
    }
  });

  it("rejects metric creation when the code fails to compile", async () => {
    const sandbox = createInlineCoreSandbox();
    try {
      await expect(
        sandbox.createMetricEvaluator(buildMetric({ code: "return (" })),
      ).rejects.toThrow();
    } finally {
      sandbox.dispose();
    }
  });

  it("compileScenario surfaces an outcome (no throw)", async () => {
    const sandbox = createInlineCoreSandbox();
    try {
      const outcome = await sandbox.compileScenario({
        scenario: {
          id: "s1",
          name: "scenario",
          scenarioParameters: [],
          parameterOverrides: {},
          initialState: { type: "per_place", content: {} },
        },
        netParameters: [],
        places: [],
        types: [],
      });
      expect(outcome.ok).toBe(true);
    } finally {
      sandbox.dispose();
    }
  });

  it("disposing the sandbox disposes all evaluators", async () => {
    const sandbox = createInlineCoreSandbox();
    const evaluator = await sandbox.createMetricEvaluator(
      buildMetric({ code: "return 1;" }),
    );
    sandbox.dispose();
    // Evaluator is now disposed; using it should throw.
    await expect(evaluator.evaluate({ places: {} })).rejects.toThrow(
      /already disposed/,
    );
  });

  it("calling methods on a disposed sandbox throws", async () => {
    const sandbox = createInlineCoreSandbox();
    sandbox.dispose();
    await expect(sandbox.createMetricEvaluator(buildMetric())).rejects.toThrow(
      /disposed/,
    );
  });
});
