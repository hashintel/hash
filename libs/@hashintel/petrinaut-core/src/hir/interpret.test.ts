import { describe, expect, it } from "vitest";

import { MAX_RANGE_LENGTH } from "../simulation/authoring/scenario/helpers";
import { HirInterpretError, interpretHir } from "./interpret";
import { lowerTypeScriptToHir } from "./lower-typescript";

import type { HirFunction } from "./hir";
import type { HirInterpretBindings } from "./interpret";

const NO_BINDINGS: HirInterpretBindings = { parameters: {}, scenario: {} };

function lower(
  code: string,
  surface: "scenario-expression" | "scenario-code" = "scenario-expression",
): HirFunction {
  const lowered = lowerTypeScriptToHir(code, surface);
  if (!lowered.ok) {
    throw new Error(
      `lowering failed: ${lowered.diagnostics.map((d) => d.message).join("; ")}`,
    );
  }
  return lowered.fn;
}

function run(code: string, bindings: HirInterpretBindings = NO_BINDINGS) {
  return interpretHir(lower(code), bindings);
}

describe("interpretHir", () => {
  it("evaluates arithmetic, comparisons and logic", () => {
    expect(run("1 + 2 * 3")).toBe(7);
    expect(run("2 ** 3 % 5")).toBe(3);
    expect(run("(1 < 2) && (3 >= 3)")).toBe(true);
    expect(run("false || 1 == 2")).toBe(false);
    expect(run("!true")).toBe(false);
    expect(run("-(2 + 3)")).toBe(-5);
  });

  it("short-circuits && and ||", () => {
    // The right side indexes out of bounds; it must not be evaluated.
    expect(run("false && [1][2] > 0")).toBe(false);
    expect(run("true || [1][2] > 0")).toBe(true);
  });

  it("evaluates constants and Math calls", () => {
    expect(run("Math.PI")).toBeCloseTo(Math.PI);
    expect(run("Math.sqrt(144)")).toBe(12);
    expect(run("Math.max(1, 5, 3)")).toBe(5);
    expect(run("Infinity")).toBe(Infinity);
  });

  it("reads parameters and scenario values through the bindings", () => {
    const bindings: HirInterpretBindings = {
      parameters: { rate: 2.5, enabled: true },
      scenario: { count: 4 },
    };
    expect(run("parameters.rate * scenario.count", bindings)).toBe(10);
    expect(run("parameters.enabled ? 1 : 0", bindings)).toBe(1);
  });

  it("reads bindings by own property only, never the prototype chain", () => {
    expect(() => run("parameters.toString")).toThrow(HirInterpretError);
    expect(() => run("scenario.constructor")).toThrow(
      "Unknown scenario parameter",
    );
    // A parameter that IS named like an Object.prototype member works.
    expect(
      run("parameters.constructor", {
        parameters: { constructor: 9 },
        scenario: {},
      }),
    ).toBe(9);
  });

  it("evaluates ternaries, arrays, records and access chains", () => {
    expect(run("[1, 2, 3][1]")).toBe(2);
    expect(run("[1, 2, 3].length")).toBe(3);
    expect(run("({ a: 1, b: 2 }).b")).toBe(2);
    expect(run("1 > 0 ? 10 : 20")).toBe(10);
  });

  it("builds records without a prototype", () => {
    const record = run('({ __proto__: 1, constructor: 2 })["constructor"]');
    expect(record).toBe(2);
    const proto = run('({ __proto__: 1 })["__proto__"]');
    expect(proto).toBe(1);
  });

  it("evaluates range, map, reduce and concat", () => {
    expect(run("range(4)")).toEqual([0, 1, 2, 3]);
    expect(run("range(1, 7, 2)")).toEqual([1, 3, 5]);
    expect(run("range(3).map((n) => n * 10)")).toEqual([0, 10, 20]);
    expect(run("range(3).map((n, i) => n + i)")).toEqual([0, 2, 4]);
    expect(run("range(4).reduce((sum, n) => sum + n, 0)")).toBe(6);
    expect(run("[1].concat([2, 3])")).toEqual([1, 2, 3]);
  });

  it("evaluates let bindings sequentially in code mode", () => {
    expect(
      interpretHir(
        lower(
          "const a = 2;\nconst b = a * 3;\nreturn { P: b };",
          "scenario-code",
        ),
        NO_BINDINGS,
      ),
    ).toEqual({ P: 6 });
  });

  it("evaluates string literals and predicates", () => {
    expect(run('"abc".startsWith("ab")')).toBe(true);
    expect(run('"abc".includes("z")')).toBe(false);
  });

  it("enforces the range length ceiling", () => {
    expect(() => run(`range(${MAX_RANGE_LENGTH + 1})`)).toThrow(
      "exceeding the limit",
    );
  });

  it("throws positioned errors on out-of-bounds access", () => {
    expect(() => run("[1, 2][5]")).toThrow("out of bounds");
    try {
      run("[1, 2][5]");
    } catch (error) {
      expect(error).toBeInstanceOf(HirInterpretError);
      expect((error as HirInterpretError).span.length).toBeGreaterThan(0);
    }
  });

  it("follows JavaScript numeric semantics for division", () => {
    expect(run("1 / 0")).toBe(Infinity);
    expect(run("0 / 0")).toBeNaN();
  });
});
