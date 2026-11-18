import { describe, expect, it } from "vitest";

import {
  defaultSimulatorParameters,
  resolveSimulatorParameters,
} from "./parameters";

import type { SimulatorParameterSpecs } from "./parameters";

const specs = {
  dt: {
    type: "number",
    label: "Time step",
    default: 0.01,
    min: 0,
    exclusiveMin: true,
  },
  substeps: { type: "integer", label: "Substeps", default: 1, min: 1, max: 8 },
  stiff: { type: "boolean", label: "Stiff", default: false },
  method: {
    type: "enum",
    label: "Method",
    options: [
      { value: "euler", label: "Euler" },
      { value: "rk4", label: "Runge-Kutta 4" },
    ],
    default: "rk4",
  },
} as const satisfies SimulatorParameterSpecs;

describe("defaultSimulatorParameters", () => {
  it("holds every parameter at its default", () => {
    expect(defaultSimulatorParameters(specs)).toEqual({
      dt: 0.01,
      substeps: 1,
      stiff: false,
      method: "rk4",
    });
  });
});

describe("resolveSimulatorParameters", () => {
  it("fills what is missing with defaults and drops what the spec does not declare", () => {
    const resolved = resolveSimulatorParameters(specs, {
      dt: 0.5,
      referenceInterval: 0.1,
    });
    expect(resolved).toEqual({
      ok: true,
      values: { dt: 0.5, substeps: 1, stiff: false, method: "rk4" },
    });
  });

  it("names every value its spec rejects", () => {
    const resolved = resolveSimulatorParameters(specs, {
      dt: 0,
      substeps: 2.5,
      stiff: "yes",
      method: "heun",
    });
    expect(resolved.ok).toBe(false);
    expect(resolved.ok ? [] : resolved.problems).toEqual([
      { key: "dt", message: "Time step is above 0" },
      { key: "substeps", message: "Substeps is a whole number" },
      { key: "stiff", message: "Stiff is on or off" },
      { key: "method", message: "Method is not one of its options" },
    ]);
  });

  it("holds a number to its range, and allows an inclusive minimum", () => {
    const outcome = (substeps: number) =>
      resolveSimulatorParameters(specs, { substeps });
    expect(outcome(1).ok).toBe(true);
    expect(outcome(0)).toMatchObject({
      ok: false,
      problems: [{ key: "substeps", message: "Substeps is at least 1" }],
    });
    expect(outcome(9)).toMatchObject({
      ok: false,
      problems: [{ key: "substeps", message: "Substeps is at most 8" }],
    });
    expect(resolveSimulatorParameters(specs, { dt: Number.NaN })).toMatchObject(
      {
        ok: false,
        problems: [{ key: "dt", message: "Time step is a number" }],
      },
    );
  });
});
