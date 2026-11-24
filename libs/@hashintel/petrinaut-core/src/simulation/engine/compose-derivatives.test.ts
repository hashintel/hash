import { describe, expect, it } from "vitest";

import { composeDerivatives } from "./compose-derivatives";

import type { DifferentialEquationFn } from "./types";

const constant =
  (...values: number[]): DifferentialEquationFn =>
  () =>
    new Float64Array(values);

describe("composeDerivatives", () => {
  it("returns a single term unchanged", () => {
    const term = constant(1, 2);
    expect(composeDerivatives([term])).toBe(term);
  });

  it("sums every term's derivatives element-wise", () => {
    const composed = composeDerivatives([
      constant(1, 2, 3, 4),
      constant(10, 20, 30, 40),
      constant(100, 200, 300, 400),
    ]);
    expect([...composed(new Uint8Array(0), 2)]).toEqual([111, 222, 333, 444]);
  });

  it("passes the token region to every term", () => {
    const seen: number[] = [];
    const term =
      (tag: number): DifferentialEquationFn =>
      (placeBytes, numberOfTokens) => {
        seen.push(tag, placeBytes.byteLength, numberOfTokens);
        return new Float64Array(numberOfTokens);
      };
    composeDerivatives([term(1), term(2)])(new Uint8Array(16), 2);
    expect(seen).toEqual([1, 16, 2, 2, 16, 2]);
  });

  it("refuses an empty composition", () => {
    expect(() => composeDerivatives([])).toThrow(/at least one/);
  });
});
