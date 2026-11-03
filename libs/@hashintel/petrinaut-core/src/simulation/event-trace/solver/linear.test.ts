import { describe, expect, it } from "vitest";

import {
  affinePropagator,
  applyAffinePropagator,
  matrixExponential,
} from "./linear";

describe("matrixExponential", () => {
  it("exponentiates a diagonal matrix entrywise", () => {
    const result = matrixExponential(Float64Array.of(1, 0, 0, -2), 2);
    expect(result[0]).toBeCloseTo(Math.E, 12);
    expect(result[1]).toBe(0);
    expect(result[2]).toBe(0);
    expect(result[3]).toBeCloseTo(Math.exp(-2), 12);
  });

  it("turns a rotation generator into a rotation", () => {
    const angle = 1.3;
    const result = matrixExponential(Float64Array.of(0, -angle, angle, 0), 2);
    expect(result[0]).toBeCloseTo(Math.cos(angle), 12);
    expect(result[1]).toBeCloseTo(-Math.sin(angle), 12);
    expect(result[2]).toBeCloseTo(Math.sin(angle), 12);
    expect(result[3]).toBeCloseTo(Math.cos(angle), 12);
  });

  it("scales and squares a matrix with a large norm", () => {
    const result = matrixExponential(Float64Array.of(-40), 1);
    expect(result[0]).toBeCloseTo(Math.exp(-40), 24);
  });
});

describe("affinePropagator", () => {
  it("advances x' = -x + 1 exactly", () => {
    const propagator = affinePropagator(
      { dimension: 1, matrix: Float64Array.of(-1), offset: Float64Array.of(1) },
      0.7,
    );
    const state = Float64Array.of(3);
    applyAffinePropagator(propagator, 1, state);
    expect(state[0]).toBeCloseTo(1 + 2 * Math.exp(-0.7), 12);
  });

  it("advances a constant drift", () => {
    const propagator = affinePropagator(
      {
        dimension: 2,
        matrix: new Float64Array(4),
        offset: Float64Array.of(2, -1),
      },
      1.5,
    );
    const state = Float64Array.of(10, 20, 30, 40);
    applyAffinePropagator(propagator, 2, state, 2);
    expect(Array.from(state)).toEqual([10, 20, 33, 38.5]);
  });
});
