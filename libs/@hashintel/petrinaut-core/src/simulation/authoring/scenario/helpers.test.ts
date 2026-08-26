import { describe, expect, it } from "vitest";

import { MAX_RANGE_LENGTH, range } from "./helpers";

describe("range", () => {
  it("range(n) counts from 0 to n-1", () => {
    expect(range(4)).toEqual([0, 1, 2, 3]);
  });

  it("range(0) and negative ends produce an empty array", () => {
    expect(range(0)).toEqual([]);
    expect(range(-3)).toEqual([]);
  });

  it("range(a, b) counts from a to b-1", () => {
    expect(range(2, 6)).toEqual([2, 3, 4, 5]);
  });

  it("range(a, b) is empty when a >= b", () => {
    expect(range(5, 5)).toEqual([]);
    expect(range(5, 0)).toEqual([]);
  });

  it("range(a, b, step) steps by step", () => {
    expect(range(0, 10, 2)).toEqual([0, 2, 4, 6, 8]);
  });

  it("supports negative steps counting down", () => {
    expect(range(5, 0, -1)).toEqual([5, 4, 3, 2, 1]);
  });

  it("supports non-integer bounds and steps", () => {
    expect(range(0, 1, 0.25)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(range(2.5)).toEqual([0, 1, 2]);
  });

  it("stays end-exclusive when a fractional step divides imprecisely", () => {
    // `0.28 / 0.01` is `28.000000000000004`, so deriving the element count
    // from the quotient alone used to round up and emit the endpoint.
    const values = range(0, 0.28, 0.01);
    expect(values).toHaveLength(28);
    expect(values.at(-1)).toBeCloseTo(0.27);
    expect(values.every((value) => value < 0.28)).toBe(true);
  });

  it("stays end-exclusive for imprecise negative fractional steps", () => {
    const values = range(0, -0.28, -0.01);
    expect(values).toHaveLength(28);
    expect(values.every((value) => value > -0.28)).toBe(true);
  });

  it("throws on a zero step", () => {
    expect(() => range(0, 5, 0)).toThrow("step must not be zero");
  });

  it("throws on non-finite arguments", () => {
    expect(() => range(Number.POSITIVE_INFINITY)).toThrow("finite numbers");
    expect(() => range(0, Number.NaN)).toThrow("finite numbers");
    // Anything user code can pass that isn't a finite number is rejected.
    expect(() => range("5" as unknown as number)).toThrow("finite numbers");
  });

  it("throws with element count when exceeding the length cap", () => {
    expect(() => range(MAX_RANGE_LENGTH + 1)).toThrow(
      `would produce ${MAX_RANGE_LENGTH + 1} elements`,
    );
  });

  it("allows the cap-sized range exactly", () => {
    expect(range(MAX_RANGE_LENGTH)).toHaveLength(MAX_RANGE_LENGTH);
  });
});
