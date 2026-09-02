import { describe, expect, it } from "vitest";

import { constraintListSchema } from "./constraint";
import { lowerConstraint } from "./lower";

import type { SDCPN } from "../types/sdcpn";
import type { LowerConstraintContext } from "./lower";

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

const context: LowerConstraintContext = {
  netParameters: sdcpn.parameters,
  scenarioParameters: [
    { identifier: "min_load", type: "integer", default: 2 },
    { identifier: "max_load", type: "integer", default: 8 },
  ],
  sdcpn,
};

describe("lowerConstraint", () => {
  it("lowers a boolean parameter expression to a parameter constraint", () => {
    const result = lowerConstraint(
      {
        space: "parameters",
        id: "c-order",
        name: "Load ordering",
        code: "scenario.min_load < scenario.max_load && parameters.rate > 0",
      },
      context,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.constraint).toMatchObject({
      space: "parameters",
      id: "c-order",
      name: "Load ordering",
      hir: { surface: "scenario-expression", params: [] },
    });
  });

  it("omits the name when none was authored", () => {
    const result = lowerConstraint(
      { space: "parameters", id: "c", code: "scenario.min_load < 5" },
      context,
    );
    expect(result.ok && "name" in result.constraint).toBe(false);
  });

  it("rejects a parameter expression that is not boolean", () => {
    const result = lowerConstraint(
      { space: "parameters", id: "c", code: "scenario.min_load + 1" },
      context,
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostics[0]?.message).toContain("boolean");
  });

  it("rejects a reference to an unknown scenario parameter", () => {
    const result = lowerConstraint(
      { space: "parameters", id: "c", code: "scenario.missing > 0" },
      context,
    );
    expect(result.ok).toBe(false);
  });

  it("lowers a boolean state condition to a state constraint", () => {
    const result = lowerConstraint(
      {
        space: "state",
        id: "c-queue",
        code: "return state.places.Queue.count <= 10;",
      },
      context,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.constraint).toMatchObject({
      space: "state",
      hir: { surface: "metric", params: [{ name: "state" }] },
    });
  });

  it("rejects a state condition returning a number", () => {
    const result = lowerConstraint(
      { space: "state", id: "c", code: "return state.places.Queue.count;" },
      context,
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostics[0]?.message).toContain("boolean");
  });

  it("produces constraints the list schema accepts verbatim", () => {
    const results = [
      lowerConstraint(
        { space: "parameters", id: "a", code: "scenario.min_load < 5" },
        context,
      ),
      lowerConstraint(
        {
          space: "state",
          id: "b",
          code: "return state.places.Queue.count > 0;",
        },
        context,
      ),
    ];
    const constraints = results.map((result) => {
      if (!result.ok) {
        throw new Error(JSON.stringify(result.diagnostics));
      }
      return result.constraint;
    });
    const parsed = constraintListSchema.safeParse(
      JSON.parse(JSON.stringify(constraints)),
    );
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(JSON.parse(JSON.stringify(constraints)));
  });
});
