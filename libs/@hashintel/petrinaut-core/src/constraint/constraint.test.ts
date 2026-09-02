import { describe, expect, it } from "vitest";

import { lowerTypeScriptToHir } from "../hir/lower-typescript";
import {
  constraintListSchema,
  constraintSchema,
  constraintsInSpace,
} from "./constraint";

import type { Constraint } from "./constraint";

const lower = (code: string, surface: "metric" | "scenario-expression") => {
  const lowered = lowerTypeScriptToHir(code, surface);
  if (!lowered.ok) {
    throw new Error(JSON.stringify(lowered.diagnostics));
  }
  return JSON.parse(JSON.stringify(lowered.fn)) as unknown;
};

const parameterConstraint = {
  space: "parameters",
  id: "c-order",
  name: "Load ordering",
  code: "scenario.min_load < scenario.max_load",
  hir: lower("scenario.min_load < scenario.max_load", "scenario-expression"),
};

const stateConstraint = {
  space: "state",
  id: "c-queue",
  code: "return state.places.Queue.count <= 10;",
  hir: lower("return state.places.Queue.count <= 10;", "metric"),
};

describe("constraintSchema", () => {
  it("accepts each shape on its own surface", () => {
    expect(constraintSchema.safeParse(parameterConstraint).success).toBe(true);
    expect(constraintSchema.safeParse(stateConstraint).success).toBe(true);
  });

  it("pins the surface to the space", () => {
    // A metric-surface function cannot pose as a parameter constraint, nor
    // the reverse: the shape itself refuses, no cross-check needed.
    const misfiledParameter = {
      ...parameterConstraint,
      hir: stateConstraint.hir,
    };
    const misfiledState = { ...stateConstraint, hir: parameterConstraint.hir };
    expect(constraintSchema.safeParse(misfiledParameter).success).toBe(false);
    expect(constraintSchema.safeParse(misfiledState).success).toBe(false);
  });

  it("rejects an unknown space", () => {
    expect(
      constraintSchema.safeParse({ ...parameterConstraint, space: "time" })
        .success,
    ).toBe(false);
  });

  it("rejects an empty id or code", () => {
    expect(
      constraintSchema.safeParse({ ...parameterConstraint, id: "" }).success,
    ).toBe(false);
    expect(
      constraintSchema.safeParse({ ...parameterConstraint, code: "  " })
        .success,
    ).toBe(false);
  });
});

describe("constraintListSchema", () => {
  it("accepts mixed spaces and rejects a duplicate id across them", () => {
    expect(
      constraintListSchema.safeParse([parameterConstraint, stateConstraint])
        .success,
    ).toBe(true);
    const duplicated = constraintListSchema.safeParse([
      parameterConstraint,
      { ...stateConstraint, id: parameterConstraint.id },
    ]);
    expect(duplicated.success).toBe(false);
    if (!duplicated.success) {
      expect(duplicated.error.issues[0]?.path).toEqual([1, "id"]);
    }
  });
});

describe("constraintsInSpace", () => {
  it("narrows to one space", () => {
    const constraints = constraintListSchema.parse([
      parameterConstraint,
      stateConstraint,
    ]) as Constraint[];
    const parameters = constraintsInSpace(constraints, "parameters");
    expect(parameters.map((constraint) => constraint.id)).toEqual(["c-order"]);
    expect(parameters[0]?.hir.surface).toBe("scenario-expression");
    const state = constraintsInSpace(constraints, "state");
    expect(state[0]?.hir.surface).toBe("metric");
  });
});
