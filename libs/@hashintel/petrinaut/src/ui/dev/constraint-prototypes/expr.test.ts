import { describe, expect, it } from "vitest";

import {
  canonicalMarginExpr,
  conjunctsOf,
  evaluateExpression,
  linearFormOf,
  marginOf,
  parseExpression,
  printExpression,
} from "./expr";

const env = (values: Record<string, number | boolean>) =>
  new Map(Object.entries(values));

const evaluate = (source: string, values: Record<string, number | boolean>) =>
  evaluateExpression(parseExpression(source), env(values));

const margin = (source: string, values: Record<string, number | boolean>) =>
  marginOf(parseExpression(source), env(values));

describe("parseExpression / evaluateExpression", () => {
  it("respects arithmetic precedence and parentheses", () => {
    expect(evaluate("1 + 2 * 3", {})).toBe(7);
    expect(evaluate("(1 + 2) * 3", {})).toBe(9);
    expect(evaluate("-2 * 3", {})).toBe(-6);
    expect(evaluate("10 % 4 + 2e1", {})).toBe(22);
  });

  it("resolves dotted identifiers from the environment", () => {
    expect(
      evaluate("scenario.a + parameters.b", {
        "scenario.a": 2,
        "parameters.b": 40,
      }),
    ).toBe(42);
  });

  it("evaluates comparisons, logic, and ternaries", () => {
    expect(evaluate("1 < 2 && 3 >= 3", {})).toBe(true);
    expect(evaluate("1 == 2 || false", {})).toBe(false);
    expect(evaluate("!(x > 5) ? 10 : 20", { x: 7 })).toBe(20);
  });

  it("evaluates math calls", () => {
    expect(evaluate("min(3, max(1, 2))", {})).toBe(2);
    expect(evaluate("abs(-4) + sqrt(9)", {})).toBe(7);
  });

  it("rejects unknown names, functions, and trailing junk", () => {
    expect(() => evaluate("mystery", {})).toThrow('Unknown name "mystery"');
    expect(() => evaluate("shrug(1)", {})).toThrow('Unknown function "shrug"');
    expect(() => parseExpression("1 + ")).toThrow();
    expect(() => parseExpression("1 2")).toThrow(/trailing/);
  });

  it("round-trips through printExpression", () => {
    for (const source of [
      "a + b * c",
      "(a + b) * c",
      "a < b && (c || !d)",
      "x > 5 ? 1 : 0",
      "min(a, b - 1)",
    ]) {
      const printed = printExpression(parseExpression(source));
      expect(printExpression(parseExpression(printed))).toBe(printed);
    }
  });
});

describe("marginOf", () => {
  it("gives signed slack for comparisons", () => {
    expect(margin("temperature < 80", { temperature: 75 })).toBe(5);
    expect(margin("temperature < 80", { temperature: 85 })).toBe(-5);
    expect(margin("throughput >= 100", { throughput: 130 })).toBe(30);
  });

  it("composes && as min and || as max", () => {
    const values = { a: 3, b: 10 };
    expect(margin("a > 0 && b < 12", values)).toBe(2);
    expect(margin("a > 5 || b < 12", values)).toBe(2);
  });

  it("negation flips the sign", () => {
    expect(margin("!(temperature < 80)", { temperature: 75 })).toBe(-5);
  });

  it("equality margins follow the Python evaluator", () => {
    expect(margin("a == 4", { a: 6 })).toBe(-2);
    expect(margin("a != 4", { a: 6 })).toBe(2);
    expect(margin("flag == true", { flag: true })).toBe(Infinity);
  });

  it("agrees in sign with boolean evaluation", () => {
    const cases: [string, Record<string, number>][] = [
      ["a + b < 10", { a: 3, b: 4 }],
      ["a + b < 10", { a: 8, b: 4 }],
      ["a > 1 && b > 1 || a < 0", { a: 2, b: 0.5 }],
    ];
    for (const [source, values] of cases) {
      const holds = evaluate(source, values) === true;
      expect(margin(source, values) >= 0).toBe(holds);
    }
  });
});

describe("linearFormOf", () => {
  const names = new Set(["x", "y"]);

  it("extracts affine coefficients", () => {
    const form = linearFormOf(parseExpression("2 * x - y / 2 + 3"), names)!;
    expect(form.constant).toBe(3);
    expect(form.coefficients.get("x")).toBe(2);
    expect(form.coefficients.get("y")).toBe(-0.5);
  });

  it("returns null for non-affine expressions", () => {
    expect(linearFormOf(parseExpression("x * y"), names)).toBeNull();
    expect(linearFormOf(parseExpression("1 / x"), names)).toBeNull();
    expect(linearFormOf(parseExpression("sqrt(x)"), names)).toBeNull();
  });
});

describe("conjunctsOf / canonicalMarginExpr", () => {
  it("splits top-level conjunctions only", () => {
    const parts = conjunctsOf(
      parseExpression("a < 1 && (b > 2 || c > 3) && d <= 4"),
    );
    expect(parts.map(printExpression)).toEqual([
      "a < 1",
      "b > 2 || c > 3",
      "d <= 4",
    ]);
  });

  it("rewrites comparisons into margin >= 0 form", () => {
    const rewritten = canonicalMarginExpr(parseExpression("makespan <= 8"))!;
    expect(printExpression(rewritten)).toBe("8 - makespan");
    expect(canonicalMarginExpr(parseExpression("a < 1 || b < 2"))).toBeNull();
  });
});
