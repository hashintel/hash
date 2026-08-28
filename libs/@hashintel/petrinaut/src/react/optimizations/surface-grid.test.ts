import { describe, expect, it } from "vitest";

import {
  buildOptimizationSurfaceAxes,
  OPTIMIZATION_AXIS_STEPS,
  optimizationAxisMidpoint,
  optimizationAxisPositionFor,
  optimizationAxisValueAt,
} from "./surface-grid";

import type { OptimizationSurfaceAxis } from "./surface-grid";
import type { PetrinautOptimizationInput } from "@hashintel/petrinaut-core";

const inputWith = (
  bindings: PetrinautOptimizationInput["scenario"]["parameterBindings"],
): PetrinautOptimizationInput =>
  ({
    scenario: { id: "s", parameterBindings: bindings },
  }) as PetrinautOptimizationInput;

describe("buildOptimizationSurfaceAxes", () => {
  it("keeps non-boolean optimized parameters, in binding order", () => {
    const axes = buildOptimizationSurfaceAxes(
      inputWith({
        rate: {
          kind: "optimize",
          domain: {
            kind: "continuous",
            minimum: 0.1,
            maximum: 2,
            scale: "linear",
          },
        },
        fixed: { kind: "fixed", value: 3 },
        flag: { kind: "optimize", domain: { kind: "boolean" } },
        batch: {
          kind: "optimize",
          domain: {
            kind: "integer",
            minimum: 10,
            maximum: 50,
            step: 5,
            scale: "linear",
          },
        },
      }),
    );

    expect(axes.map((axis) => axis.identifier)).toEqual(["rate", "batch"]);
    expect(axes[0]!.stepCount).toBe(OPTIMIZATION_AXIS_STEPS);
    // 8 domain steps of 5 between 10 and 50.
    expect(axes[1]!.stepCount).toBe(8);
  });
});

describe("optimizationAxisValueAt", () => {
  it("maps linear continuous positions across the domain", () => {
    const axis: OptimizationSurfaceAxis = {
      identifier: "rate",
      domain: { kind: "continuous", minimum: 0, maximum: 1, scale: "linear" },
      stepCount: 50,
    };
    expect(optimizationAxisValueAt(axis, 0)).toBe(0);
    expect(optimizationAxisValueAt(axis, 25)).toBe(0.5);
    expect(optimizationAxisValueAt(axis, 50)).toBe(1);
  });

  it("quantizes log-scale domains in log space", () => {
    const axis: OptimizationSurfaceAxis = {
      identifier: "rate",
      domain: { kind: "continuous", minimum: 0.01, maximum: 100, scale: "log" },
      stepCount: 50,
    };
    expect(optimizationAxisValueAt(axis, 0)).toBe(0.01);
    // Halfway in log space is the geometric mean.
    expect(optimizationAxisValueAt(axis, 25)).toBeCloseTo(1, 9);
    expect(optimizationAxisValueAt(axis, 50)).toBe(100);
  });

  it("snaps integer domains to their step", () => {
    const axis: OptimizationSurfaceAxis = {
      identifier: "batch",
      domain: {
        kind: "integer",
        minimum: 10,
        maximum: 50,
        step: 5,
        scale: "linear",
      },
      stepCount: 8,
    };
    expect(optimizationAxisValueAt(axis, 0)).toBe(10);
    expect(optimizationAxisValueAt(axis, 3)).toBe(25);
    expect(optimizationAxisValueAt(axis, 8)).toBe(50);
  });
});

describe("optimizationAxisPositionFor", () => {
  it("inverts the linear mapping, clamped to the domain", () => {
    const axis: OptimizationSurfaceAxis = {
      identifier: "rate",
      domain: { kind: "continuous", minimum: 0, maximum: 1, scale: "linear" },
      stepCount: 50,
    };
    expect(optimizationAxisPositionFor(axis, 0.5)).toBe(25);
    expect(optimizationAxisPositionFor(axis, -4)).toBe(0);
    expect(optimizationAxisPositionFor(axis, 7)).toBe(50);
  });

  it("inverts the log mapping", () => {
    const axis: OptimizationSurfaceAxis = {
      identifier: "rate",
      domain: { kind: "continuous", minimum: 0.01, maximum: 100, scale: "log" },
      stepCount: 50,
    };
    expect(optimizationAxisPositionFor(axis, 1)).toBe(25);
    expect(
      optimizationAxisPositionFor(axis, optimizationAxisValueAt(axis, 37)),
    ).toBe(37);
  });

  it("gives the midpoint of an axis", () => {
    const axis: OptimizationSurfaceAxis = {
      identifier: "batch",
      domain: {
        kind: "integer",
        minimum: 10,
        maximum: 50,
        step: 5,
        scale: "linear",
      },
      stepCount: 8,
    };
    expect(optimizationAxisMidpoint(axis)).toBe(4);
    expect(optimizationAxisValueAt(axis, 4)).toBe(30);
  });
});
