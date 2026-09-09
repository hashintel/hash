import { describe, expect, it } from "vitest";

import { parseExpression } from "./expr";
import {
  penaltyMultiplier,
  softMax,
  softMin,
  stepMargins,
  traceRobustness,
  usesTemporalOperators,
} from "./robustness";
import { simulateToyRun, toyObjective, TOY_DEFAULTS } from "./toy-model";

import type { Trace } from "./robustness";

const traceOf = (temperatures: number[]): Trace => ({
  times: temperatures.map((_, index) => index),
  steps: temperatures.map(
    (temperature) => new Map([["temperature", temperature]]),
  ),
});

describe("traceRobustness", () => {
  it("reads a plain predicate as an implicit always", () => {
    const node = parseExpression("temperature < 80");
    expect(traceRobustness(node, traceOf([70, 75, 78]))).toBe(2);
    expect(traceRobustness(node, traceOf([70, 85, 60]))).toBe(-5);
  });

  it("supports eventually as the max over the run", () => {
    const node = parseExpression("eventually(temperature > 76)");
    expect(traceRobustness(node, traceOf([70, 75, 60]))).toBe(-1);
    expect(traceRobustness(node, traceOf([70, 79, 60]))).toBe(3);
  });

  it("applies windows in trace time units", () => {
    const node = parseExpression("during(0, 1, temperature < 80)");
    // Only the first two steps fall in [0, 1]: the later 90 is outside.
    expect(traceRobustness(node, traceOf([70, 75, 90]))).toBe(5);
  });

  it("scores until as held-prefix against release", () => {
    const node = parseExpression("until(temperature < 80, temperature > 100)");
    expect(traceRobustness(node, traceOf([70, 75, 110]))).toBeGreaterThan(0);
    expect(traceRobustness(node, traceOf([70, 95, 110]))).toBeLessThan(0);
  });

  it("detects temporal operators", () => {
    expect(usesTemporalOperators(parseExpression("always(a < 1)"))).toBe(true);
    expect(usesTemporalOperators(parseExpression("min(a, 1) < 2"))).toBe(false);
  });

  it("smooth robustness under-approximates always and converges", () => {
    const node = parseExpression("temperature < 80");
    const trace = traceOf([70, 75, 78]);
    const exact = traceRobustness(node, trace);
    const smooth = traceRobustness(node, trace, { temperature: 1 });
    expect(smooth).toBeLessThanOrEqual(exact);
    const sharper = traceRobustness(node, trace, { temperature: 0.05 });
    expect(Math.abs(sharper - exact)).toBeLessThan(0.2);
  });
});

describe("softMin / softMax", () => {
  it("bracket the exact extrema within ln(m)·T", () => {
    const values = [3, 5, -2, 0.5];
    const temperature = 0.7;
    const bound = Math.log(values.length) * temperature;
    expect(softMin(values, temperature)).toBeLessThanOrEqual(-2);
    expect(softMin(values, temperature)).toBeGreaterThanOrEqual(-2 - bound);
    expect(softMax(values, temperature)).toBeGreaterThanOrEqual(5);
    expect(softMax(values, temperature)).toBeLessThanOrEqual(5 + bound);
  });
});

describe("penaltyMultiplier", () => {
  it("is 1 inside and decays smoothly outside for the exponential kind", () => {
    expect(penaltyMultiplier(3, 5, "exponential")).toBe(1);
    expect(penaltyMultiplier(0, 5, "exponential")).toBe(1);
    const shallow = penaltyMultiplier(-1, 5, "exponential");
    const deep = penaltyMultiplier(-10, 5, "exponential");
    expect(shallow).toBeGreaterThan(deep);
    expect(deep).toBeGreaterThan(0);
  });

  it("hard is the step function", () => {
    expect(penaltyMultiplier(0.01, 5, "hard")).toBe(1);
    expect(penaltyMultiplier(-0.01, 5, "hard")).toBe(0);
  });

  it("logistic is monotone and crosses 1/2 at the boundary", () => {
    expect(penaltyMultiplier(0, 5, "logistic")).toBeCloseTo(0.5);
    expect(penaltyMultiplier(5, 5, "logistic")).toBeGreaterThan(0.9);
    expect(penaltyMultiplier(-5, 5, "logistic")).toBeLessThan(0.1);
  });
});

describe("toy model", () => {
  it("is deterministic under a seed and exposes metrics plus parameters", () => {
    const first = simulateToyRun(TOY_DEFAULTS, 7);
    const second = simulateToyRun(TOY_DEFAULTS, 7);
    expect(toyObjective(first)).toBe(toyObjective(second));
    const step = first.steps[10]!;
    expect(step.get("temperature")).toBeTypeOf("number");
    expect(step.get("flow_rate")).toBe(TOY_DEFAULTS.flow_rate);
  });

  it("hotter runs violate a temperature ceiling that cool runs hold", () => {
    const cool = simulateToyRun({
      ...TOY_DEFAULTS,
      flow_rate: 2,
      cooling_power: 7,
    });
    const hot = simulateToyRun({
      ...TOY_DEFAULTS,
      flow_rate: 10,
      cooling_power: 0,
    });
    const node = parseExpression("temperature < 80");
    expect(traceRobustness(node, cool)).toBeGreaterThan(0);
    expect(traceRobustness(node, hot)).toBeLessThan(0);
    expect(Math.min(...stepMargins(node, hot))).toBeLessThan(0);
  });
});
