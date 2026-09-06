import { describe, expect, it } from "vitest";

import { clampSimulationParameterValue } from "./simulation-parameter-bounds";

describe("clampSimulationParameterValue", () => {
  const bounds = { min: 0, max: 1 };

  it("leaves an unbounded value unchanged", () => {
    expect(clampSimulationParameterValue(12)).toBe(12);
  });

  it("leaves a value inside the bounds unchanged", () => {
    expect(clampSimulationParameterValue(0.4, bounds)).toBe(0.4);
  });

  it("clamps values to the nearest bound", () => {
    expect(clampSimulationParameterValue(-0.1, bounds)).toBe(0);
    expect(clampSimulationParameterValue(1.1, bounds)).toBe(1);
  });
});
