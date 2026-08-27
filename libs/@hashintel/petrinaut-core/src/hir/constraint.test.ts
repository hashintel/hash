import { describe, expect, it } from "vitest";

import { petrinautOptimizationConstraintsSchema } from "../optimization";
import { lowerOptimizationConstraint } from "./constraint";

import type { SDCPN } from "../types/sdcpn";
import type { LowerOptimizationConstraintContext } from "./constraint";

const sdcpn: SDCPN = {
  places: [
    {
      id: "place-queue",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  transitions: [],
  types: [],
  parameters: [
    {
      id: "param-rate",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "1.5",
    },
  ],
  differentialEquations: [],
};

const context: LowerOptimizationConstraintContext = {
  netParameters: sdcpn.parameters,
  scenarioParameters: [
    { identifier: "min_load", type: "integer", default: 2 },
    { identifier: "max_load", type: "integer", default: 8 },
  ],
  sdcpn,
};

describe("lowerOptimizationConstraint", () => {
  it("lowers a boolean parameter-space expression", () => {
    const result = lowerOptimizationConstraint(
      "scenario.min_load < scenario.max_load && parameters.rate > 0",
      "parameterSpace",
      context,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.hir.surface).toBe("scenario-expression");
  });

  it("rejects a parameter-space expression that is not boolean", () => {
    const result = lowerOptimizationConstraint(
      "scenario.min_load + 1",
      "parameterSpace",
      context,
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostics[0]?.message).toContain("boolean");
  });

  it("rejects a reference to an unknown scenario parameter", () => {
    const result = lowerOptimizationConstraint(
      "scenario.missing > 0",
      "parameterSpace",
      context,
    );
    expect(result.ok).toBe(false);
  });

  it("lowers a boolean state condition on the metric surface", () => {
    const result = lowerOptimizationConstraint(
      "return state.places.Queue.count <= 10;",
      "stateSpace",
      context,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.hir.surface).toBe("metric");
  });

  it("rejects a state condition returning a number", () => {
    const result = lowerOptimizationConstraint(
      "return state.places.Queue.count;",
      "stateSpace",
      context,
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostics[0]?.message).toContain("boolean");
  });

  it("round-trips through the constraints schema, which pins the surface", () => {
    const lowered = lowerOptimizationConstraint(
      "scenario.min_load < scenario.max_load",
      "parameterSpace",
      context,
    );
    if (!lowered.ok) {
      throw new Error(JSON.stringify(lowered.diagnostics));
    }
    const constraint = {
      id: "c-order",
      name: "Load ordering",
      code: "scenario.min_load < scenario.max_load",
      hir: lowered.hir,
    };
    const parsed = petrinautOptimizationConstraintsSchema.safeParse(
      JSON.parse(
        JSON.stringify({ parameterSpace: [constraint], stateSpace: [] }),
      ),
    );
    expect(parsed.success).toBe(true);

    // The same HIR on the wrong list fails the surface refinement.
    const misfiled = petrinautOptimizationConstraintsSchema.safeParse(
      JSON.parse(
        JSON.stringify({ parameterSpace: [], stateSpace: [constraint] }),
      ),
    );
    expect(misfiled.success).toBe(false);
  });

  it("rejects duplicate constraint ids across both lists", () => {
    const lowered = lowerOptimizationConstraint(
      "scenario.min_load < 5",
      "parameterSpace",
      context,
    );
    if (!lowered.ok) {
      throw new Error(JSON.stringify(lowered.diagnostics));
    }
    const constraint = {
      id: "dup",
      code: "scenario.min_load < 5",
      hir: lowered.hir,
    };
    const parsed = petrinautOptimizationConstraintsSchema.safeParse(
      JSON.parse(
        JSON.stringify({
          parameterSpace: [constraint, constraint],
          stateSpace: [],
        }),
      ),
    );
    expect(parsed.success).toBe(false);
  });
});
