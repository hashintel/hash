import { describe, expect, it } from "vitest";

import { runSandboxed } from "../sandbox";
import { MAX_RANGE_LENGTH, range, SCENARIO_HELPERS } from "./helpers";

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

  it("works inside runSandboxed (no species-creating array methods)", () => {
    expect(runSandboxed(() => range(3))).toEqual([0, 1, 2]);
  });
});

describe("SCENARIO_HELPERS", () => {
  it("exposes frozen helpers so user code cannot mutate them", () => {
    expect(Object.isFrozen(SCENARIO_HELPERS)).toBe(true);
    for (const helper of Object.values(SCENARIO_HELPERS)) {
      expect(Object.isFrozen(helper)).toBe(true);
    }
  });
});
