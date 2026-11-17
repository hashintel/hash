import { describe, expect, it } from "vitest";

import { formatSettingNumber, summarizeRunSettings } from "./summary";

import type { SimulatorParameterSpecs } from "@hashintel/petrinaut-core";

const stepped: SimulatorParameterSpecs = {
  dt: { type: "number", label: "Time step", unit: "s", default: 0.01 },
};
const solved: SimulatorParameterSpecs = {
  tolerance: { type: "number", label: "Max error", default: 1e-6 },
  exact: { type: "boolean", label: "Exact", default: false },
  order: {
    type: "integer",
    label: "Order",
    default: 4,
    enabledWhen: { key: "exact", in: [true] },
  },
  method: {
    type: "enum",
    label: "Method",
    options: [
      { value: "rk4", label: "Runge-Kutta 4" },
      { value: "euler", label: "Euler" },
    ],
    default: "rk4",
  },
};

describe("formatSettingNumber", () => {
  it("keeps an ordinary number as typed and shortens a very small or large one", () => {
    expect(formatSettingNumber(0.01)).toBe("0.01");
    expect(formatSettingNumber(60)).toBe("60");
    expect(formatSettingNumber(0)).toBe("0");
    expect(formatSettingNumber(0.000001)).toBe("1e-6");
    expect(formatSettingNumber(0.00025)).toBe("2.5e-4");
    expect(formatSettingNumber(2_000_000)).toBe("2e6");
  });
});

describe("summarizeRunSettings", () => {
  it("reads a number with a unit by its unit, stored or by default", () => {
    const base = {
      mode: "quick",
      clock: "time",
      specs: stepped,
      runs: 100,
      maxTime: null,
    } as const;
    expect(summarizeRunSettings({ ...base, parameters: {} })).toEqual([
      "0.01 s",
    ]);
    expect(summarizeRunSettings({ ...base, parameters: { dt: 0.1 } })).toEqual([
      "0.1 s",
    ]);
  });

  it("names a number without a unit, an enum by its option and a boolean only when on", () => {
    const base = {
      mode: "quick",
      clock: "time",
      specs: solved,
      runs: 100,
      maxTime: null,
    } as const;
    expect(summarizeRunSettings({ ...base, parameters: {} })).toEqual([
      "Max error 1e-6",
      "Runge-Kutta 4",
    ]);
    // Turning the boolean on shows it, and the parameter it enables.
    expect(
      summarizeRunSettings({
        ...base,
        parameters: { exact: true, method: "euler" },
      }),
    ).toEqual(["Max error 1e-6", "Exact", "Order 4", "Euler"]);
  });

  it("adds the run count and the end time of a Stochastic simulation", () => {
    expect(
      summarizeRunSettings({
        mode: "stochastic",
        clock: "time",
        specs: stepped,
        parameters: { dt: 0.1 },
        runs: 1500,
        maxTime: 60,
      }),
    ).toEqual(["0.1 s", "1,500 runs", "to 60 s"]);
  });

  it("says step by step in place of the parameters on a clock of steps, and ends at a step", () => {
    expect(
      summarizeRunSettings({
        mode: "stochastic",
        clock: "steps",
        specs: stepped,
        parameters: { dt: 0.1 },
        runs: 1500,
        maxTime: 59.5,
      }),
    ).toEqual(["step by step", "1,500 runs", "to step 60"]);
  });
});
