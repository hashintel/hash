import { describe, expect, it } from "vitest";

import { lowerTypeScriptToHir } from "./lower-typescript";
import { lowerScenarioToHir } from "./scenario";
import {
  buildScenarioCodeContext,
  buildScenarioExpressionContext,
} from "./surface-context";
import { typecheckHir } from "./typecheck";

import type { Scenario } from "../types/sdcpn";
import type { HirFunction } from "./hir";

function lowerExpression(code: string): HirFunction {
  const lowered = lowerTypeScriptToHir(code, "scenario-expression");
  if (!lowered.ok) {
    throw new Error(lowered.diagnostics.map((d) => d.message).join("; "));
  }
  return lowered.fn;
}

function expressionErrors(code: string): string[] {
  const lowered = lowerTypeScriptToHir(code, "scenario-expression");
  return lowered.ok ? [] : lowered.diagnostics.map((d) => d.message);
}

describe("scenario-expression lowering", () => {
  it("lowers scenario and parameters property reads", () => {
    const fn = lowerExpression("parameters.rate * scenario.count");
    expect(fn.surface).toBe("scenario-expression");
    expect(fn.params).toEqual([]);
    expect(fn.body.kind).toBe("binary");
  });

  it("lowers destructuring from the scenario object", () => {
    const lowered = lowerTypeScriptToHir(
      "const { count } = scenario;\nreturn count * 2;",
      "scenario-code",
    );
    expect(lowered.ok).toBe(true);
  });

  it("rejects the bare scenario object", () => {
    expect(expressionErrors("scenario")[0]).toContain(
      "can only be used via property access",
    );
  });

  it("lowers range calls with 1 to 3 arguments", () => {
    expect(lowerExpression("range(5)").body.kind).toBe("rangeCall");
    expect(lowerExpression("range(1, 5)").body.kind).toBe("rangeCall");
    expect(lowerExpression("range(0, 10, 2)").body.kind).toBe("rangeCall");
    expect(expressionErrors("range()")[0]).toContain("1 to 3");
  });

  it("prefers a local binding named range over the helper", () => {
    const lowered = lowerTypeScriptToHir(
      "const range = 3;\nreturn { P: range };",
      "scenario-code",
    );
    expect(lowered.ok).toBe(true);
  });

  it("desugars Array.from({ length }) to range", () => {
    const bare = lowerExpression("Array.from({ length: 4 })");
    expect(bare.body.kind).toBe("rangeCall");

    const withCallback = lowerExpression(
      "Array.from({ length: 4 }, (v, i) => i * 2)",
    );
    expect(withCallback.body.kind).toBe("arrayMap");

    const noParams = lowerExpression("Array.from({ length: 3 }, () => 0)");
    expect(noParams.body.kind).toBe("arrayMap");
  });

  it("rejects Array.from without the { length } form", () => {
    expect(expressionErrors("Array.from([1, 2])")[0]).toContain(
      "{ length: n }",
    );
  });

  it("keeps spans relative to the raw user text", () => {
    const lowered = lowerTypeScriptToHir("nonsense", "scenario-expression");
    expect(lowered.ok).toBe(false);
    if (!lowered.ok) {
      expect(lowered.diagnostics[0]!.span).toEqual({ start: 0, length: 8 });
    }
  });

  it("rejects range in non-scenario surfaces", () => {
    const lowered = lowerTypeScriptToHir(
      "export default Lambda(() => range(3).length);",
      "lambda",
    );
    expect(lowered.ok).toBe(false);
  });
});

describe("scenario typechecking", () => {
  const netParameters = [
    {
      id: "p1",
      name: "Rate",
      variableName: "rate",
      type: "real" as const,
      defaultValue: "1",
    },
  ];
  const scenarioParameters = [
    { type: "integer" as const, identifier: "count", default: 3 },
  ];

  it("accepts known parameter and scenario reads", () => {
    const fn = lowerExpression("parameters.rate * scenario.count");
    const result = typecheckHir(
      fn,
      buildScenarioExpressionContext(netParameters, scenarioParameters, "real"),
    );
    expect(result.diagnostics).toEqual([]);
  });

  it("rejects unknown scenario parameters", () => {
    const fn = lowerExpression("scenario.missing");
    const result = typecheckHir(
      fn,
      buildScenarioExpressionContext(netParameters, scenarioParameters, "real"),
    );
    expect(result.diagnostics[0]!.code).toBe("hir:unknown-scenario-parameter");
  });

  it("rejects a boolean where a number is expected", () => {
    const fn = lowerExpression("1 > 0");
    const result = typecheckHir(
      fn,
      buildScenarioExpressionContext(netParameters, scenarioParameters, "real"),
    );
    expect(result.diagnostics[0]!.code).toBe("hir:scenario-return");
  });

  it("rejects distributions in scenario code", () => {
    const fn = lowerExpression("Distribution.Gaussian(0, 1)");
    const result = typecheckHir(
      fn,
      buildScenarioExpressionContext(netParameters, scenarioParameters, "real"),
    );
    expect(
      result.diagnostics.some(
        (d) => d.code === "hir:distribution-outside-kernel",
      ),
    ).toBe(true);
  });

  it("checks code-mode result records against the net's places", () => {
    const places = [
      {
        id: "pl1",
        name: "Pool",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 0,
        y: 0,
      },
    ];
    const context = buildScenarioCodeContext(
      netParameters,
      scenarioParameters,
      places,
      [],
    );

    const ok = lowerTypeScriptToHir("return { Pool: 3 };", "scenario-code");
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(typecheckHir(ok.fn, context).diagnostics).toEqual([]);
    }

    const unknownPlace = lowerTypeScriptToHir(
      "return { Nowhere: 3 };",
      "scenario-code",
    );
    expect(unknownPlace.ok).toBe(true);
    if (unknownPlace.ok) {
      expect(typecheckHir(unknownPlace.fn, context).diagnostics[0]!.code).toBe(
        "hir:unknown-scenario-place",
      );
    }

    const wrongShape = lowerTypeScriptToHir(
      "return { Pool: [{ x: 1 }] };",
      "scenario-code",
    );
    expect(wrongShape.ok).toBe(true);
    if (wrongShape.ok) {
      expect(typecheckHir(wrongShape.fn, context).diagnostics[0]!.code).toBe(
        "hir:type-mismatch",
      );
    }
  });
});

describe("lowerScenarioToHir", () => {
  const scenario = (overrides: Partial<Scenario>): Scenario => ({
    id: "s1",
    name: "Test",
    scenarioParameters: [],
    parameterOverrides: {},
    initialState: { type: "per_place", content: {} },
    ...overrides,
  });

  it("lowers non-empty overrides and per-place expressions", () => {
    const hir = lowerScenarioToHir(
      scenario({
        parameterOverrides: { p1: "1 + 1", p2: "", p3: "  " },
        initialState: {
          type: "per_place",
          content: { pl1: "scenario.count", pl2: "", pl3: [[1, 2]] },
        },
      }),
    );
    expect(Object.keys(hir.parameterOverrides)).toEqual(["p1"]);
    expect(Object.keys(hir.placeExpressions)).toEqual(["pl1"]);
    expect(hir.initialStateCode).toBeUndefined();
  });

  it("lowers code-mode bodies and records failures per item", () => {
    const hir = lowerScenarioToHir(
      scenario({
        parameterOverrides: { p1: "for (;;) {}" },
        initialState: { type: "code", content: "return { Pool: 1 };" },
      }),
    );
    expect(hir.parameterOverrides.p1).toMatchObject({ ok: false });
    expect(hir.initialStateCode).toMatchObject({ ok: true });
  });

  it("stores hostile item ids as own record keys", () => {
    // JSON.parse creates own `__proto__` keys, as an imported file would.
    const hir = lowerScenarioToHir(
      scenario({
        parameterOverrides: JSON.parse(
          '{"__proto__": "1", "constructor": "2"}',
        ) as Record<string, string>,
      }),
    );
    expect(Object.hasOwn(hir.parameterOverrides, "__proto__")).toBe(true);
    expect(Object.hasOwn(hir.parameterOverrides, "constructor")).toBe(true);
    expect(Object.getPrototypeOf(hir.parameterOverrides)).toBe(null);
  });
});
