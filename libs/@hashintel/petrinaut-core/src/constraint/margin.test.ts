import { describe, expect, it } from "vitest";

import { HirInterpretError } from "../hir/interpret";
import { lowerTypeScriptToHir } from "../hir/lower-typescript";
import { constraintMargin, evaluateParameterConstraints } from "./margin";

import type { HirFunction } from "../hir/hir";
import type { ParameterConstraint } from "./constraint";

const lower = (code: string): HirFunction => {
  const result = lowerTypeScriptToHir(code, "scenario-expression");
  if (!result.ok) {
    throw new Error(result.diagnostics[0]?.message);
  }
  return result.fn;
};

const bindings = {
  parameters: { rate: 1.5, enabled: true },
  scenario: { min_load: 2, max_load: 8, flag: false },
};

const margin = (code: string): number =>
  constraintMargin(lower(code), bindings);

describe("constraintMargin", () => {
  it("gives a comparison its signed slack", () => {
    expect(margin("scenario.min_load <= scenario.max_load")).toBe(6);
    expect(margin("scenario.min_load < 10")).toBe(8);
    expect(margin("scenario.min_load >= 5")).toBe(-3);
    expect(margin("scenario.max_load > 3")).toBe(5);
    expect(margin("scenario.min_load == 2")).toBe(0);
    expect(margin("scenario.min_load == 5")).toBe(-3);
    expect(margin("scenario.min_load != 5")).toBe(3);
  });

  it("reports a strict comparison at exact equality as failed by its sign", () => {
    expect(margin("scenario.min_load < 2")).toBeLessThan(0);
    expect(margin("scenario.min_load > 2")).toBeLessThan(0);
    expect(margin("scenario.min_load != 2")).toBeLessThan(0);
    expect(margin("scenario.min_load <= 2")).toBe(0);
  });

  it("takes the minimum over && and the maximum over ||", () => {
    expect(margin("scenario.min_load < 10 && scenario.max_load < 10")).toBe(2);
    expect(margin("scenario.min_load < 10 && scenario.max_load < 5")).toBe(-3);
    expect(margin("scenario.min_load > 10 || scenario.max_load < 10")).toBe(2);
    expect(margin("scenario.min_load > 10 || scenario.max_load > 10")).toBe(-2);
  });

  it("flips the sign under !", () => {
    expect(margin("!(scenario.min_load < 10)")).toBe(-8);
    expect(margin("!(scenario.min_load > 10)")).toBe(8);
  });

  it("gives a bare boolean one unit on the side of its verdict", () => {
    expect(margin("true")).toBe(1);
    expect(margin("false")).toBe(-1);
    expect(margin("parameters.enabled")).toBe(1);
    expect(margin("scenario.flag")).toBe(-1);
    expect(margin("parameters.enabled == scenario.flag")).toBe(-1);
    expect(margin("parameters.enabled != scenario.flag")).toBe(1);
  });

  it("takes the chosen branch of a conditional", () => {
    expect(
      margin(
        "parameters.enabled ? scenario.min_load < 10 : scenario.min_load > 10",
      ),
    ).toBe(8);
    expect(
      margin("scenario.flag ? scenario.min_load < 10 : scenario.min_load > 10"),
    ).toBe(-8);
  });

  it("evaluates through math calls and arithmetic", () => {
    expect(margin("Math.max(scenario.min_load, 3) * 2 <= 10")).toBe(4);
    expect(margin("Math.abs(scenario.min_load - scenario.max_load) < 5")).toBe(
      -1,
    );
  });

  it("scopes let bindings", () => {
    const fn = lowerTypeScriptToHir(
      "const gap = scenario.max_load - scenario.min_load; return gap >= 4;",
      "scenario-code",
    );
    if (!fn.ok) {
      throw new Error(fn.diagnostics[0]?.message);
    }
    expect(constraintMargin(fn.fn, bindings)).toBe(2);
  });

  it("throws where interpretation would", () => {
    expect(() => margin("scenario.unknown < 3")).toThrow(HirInterpretError);
  });
});

describe("evaluateParameterConstraints", () => {
  it("returns one margin per constraint in the list's order", () => {
    const constraints: ParameterConstraint[] = [
      {
        space: "parameters",
        id: "order",
        code: "scenario.min_load < scenario.max_load",
        hir: {
          ...lower("scenario.min_load < scenario.max_load"),
          surface: "scenario-expression",
        },
      },
      {
        space: "parameters",
        id: "cap",
        code: "scenario.max_load <= 5",
        hir: {
          ...lower("scenario.max_load <= 5"),
          surface: "scenario-expression",
        },
      },
    ];
    expect(evaluateParameterConstraints(constraints, bindings)).toEqual([
      { constraintId: "order", margin: 6 },
      { constraintId: "cap", margin: -3 },
    ]);
  });
});
