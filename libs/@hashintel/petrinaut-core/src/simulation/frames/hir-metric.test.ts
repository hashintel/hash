import { describe, expect, it } from "vitest";

import { createHirMetricEvaluator } from "./hir-metric";

import type { HirMetricArtifact } from "../../hir/instantiate";
import type { SimulationFrameRawView, SimulationFrameReader } from "../api";

const makeFrame = (
  stringPool?: SimulationFrameRawView["stringPool"],
  parameterValues?: SimulationFrameRawView["parameterValues"],
): SimulationFrameReader => ({
  number: 0,
  time: 0,
  getPlaceTokenCount: () => 0,
  getPlaceTokens: () => [],
  getTransitionState: () => null,
  toFrameState: () => ({ number: 0, places: {} }),
  getRawView: () => ({
    f64: new Float64Array(),
    u64: new BigUint64Array(),
    u8: new Uint8Array(),
    placeCounts: new Uint32Array(),
    placeOffsets: new Uint32Array(),
    placeIndexById: new Map(),
    ...(stringPool ? { stringPool } : {}),
    ...(parameterValues ? { parameterValues } : {}),
  }),
});

const createEvaluator = (source: string) =>
  createHirMetricEvaluator({
    metricName: "Label length",
    artifact: { source, placeNames: [] } satisfies HirMetricArtifact,
    places: [],
  });

describe("createHirMetricEvaluator", () => {
  it("throws when a string metric reads a frame without a string pool", () => {
    const evaluate = createEvaluator("() => __pool.get(0).length");

    expect(() => evaluate(makeFrame())).toThrow(
      /Metric "Label length".*no string pool/i,
    );
  });

  it("uses each frame's current string pool and releases it after evaluation", () => {
    const evaluate = createEvaluator("() => __pool.get(1).length");

    expect(evaluate(makeFrame({ get: () => "alpha" }))).toBe(5);
    expect(evaluate(makeFrame({ get: () => "beta" }))).toBe(4);
    expect(() => evaluate(makeFrame())).toThrow(/no string pool/i);
  });

  it("does not require a string pool for metrics that do not read strings", () => {
    const evaluate = createEvaluator("() => 42");

    expect(evaluate(makeFrame())).toBe(42);
  });

  it("binds ambient net parameter values into the program", () => {
    const evaluate = createHirMetricEvaluator({
      metricName: "Weighted",
      artifact: {
        source: "() => __params.weight * 2",
        placeNames: [],
      } satisfies HirMetricArtifact,
      places: [],
      parameterValues: { weight: 21 },
    });

    expect(evaluate(makeFrame())).toBe(42);
  });

  it("uses each frame's per-run parameter values over the defaults", () => {
    // One shared evaluator, as Monte-Carlo builds it once and runs it across
    // every run — each run's frame carries its own resolved parameters.
    const evaluate = createHirMetricEvaluator({
      metricName: "Weighted",
      artifact: {
        source: "() => __params.weight * 2",
        placeNames: [],
      } satisfies HirMetricArtifact,
      places: [],
      parameterValues: { weight: 1 },
    });

    expect(evaluate(makeFrame(undefined, { weight: 10 }))).toBe(20);
    expect(evaluate(makeFrame(undefined, { weight: 3 }))).toBe(6);
    // A frame without per-run values falls back to the construction default.
    expect(evaluate(makeFrame())).toBe(2);
  });
});
