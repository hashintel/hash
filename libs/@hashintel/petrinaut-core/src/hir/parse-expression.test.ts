import { describe, expect, it } from "vitest";

import { walkHir } from "./hir";
import { interpretHirExpr } from "./interpret";
import { parseHirExpression } from "./parse-expression";

import type { HirDiagnostic, HirExpr } from "./hir";
import type { HirInterpretBindings, HirValue } from "./interpret";

const parse = (source: string): HirExpr => {
  const result = parseHirExpression(source);
  if (!result.ok) {
    throw new Error(`${source} did not parse: ${result.diagnostic.message}`);
  }
  return result.expr;
};

const failure = (source: string): HirDiagnostic => {
  const result = parseHirExpression(source);
  if (result.ok) {
    throw new Error(`${source} parsed`);
  }
  return result.diagnostic;
};

const NO_BINDINGS: HirInterpretBindings = { parameters: {}, scenario: {} };

const evaluate = (
  source: string,
  bindings: HirInterpretBindings = NO_BINDINGS,
): HirValue => interpretHirExpr(parse(source), new Map(), bindings);

/** The source text a node's span covers. */
const text = (source: string, expr: HirExpr): string =>
  source.slice(expr.span.start, expr.span.start + expr.span.length);

describe("parseHirExpression", () => {
  describe("literals", () => {
    it("parses decimal numbers, keeping the raw text", () => {
      expect(parse("42")).toMatchObject({
        kind: "numberLit",
        value: 42,
        raw: "42",
      });
      expect(parse("1.5e3")).toMatchObject({ kind: "numberLit", value: 1500 });
      expect(parse(".5")).toMatchObject({ kind: "numberLit", value: 0.5 });
      expect(parse("1e-9")).toMatchObject({ kind: "numberLit", raw: "1e-9" });
      expect(parse("0")).toMatchObject({ kind: "numberLit", value: 0 });
      expect(parse("0.5")).toMatchObject({ kind: "numberLit", value: 0.5 });
    });

    it("refuses leading zeros, as strict-mode JavaScript does", () => {
      expect(failure("00").message).toBe("Numbers may not start with `0`.");
      expect(failure("08")).toMatchObject({ span: { start: 0, length: 2 } });
    });

    it("parses booleans and the numeric constants", () => {
      expect(parse("true")).toMatchObject({ kind: "boolLit", value: true });
      expect(parse("false")).toMatchObject({ kind: "boolLit", value: false });
      expect(parse("Infinity")).toMatchObject({
        kind: "constant",
        name: "Infinity",
      });
      expect(parse("NaN")).toMatchObject({ kind: "constant", name: "NaN" });
    });
  });

  describe("names", () => {
    it("lowers the ambient reads", () => {
      expect(parse("parameters.rate")).toMatchObject({
        kind: "paramRef",
        name: "rate",
        span: { start: 0, length: 15 },
      });
      expect(parse("( scenario.k )")).toMatchObject({
        kind: "scenarioRef",
        name: "k",
      });
      expect(parse("parameters.length")).toMatchObject({
        kind: "paramRef",
        name: "length",
      });
    });

    it("lowers any other bare name to a local reference", () => {
      expect(parse("i")).toMatchObject({ kind: "localRef", name: "i" });
      expect(parse("eval")).toMatchObject({ kind: "localRef", name: "eval" });
    });

    it("refuses an ambient object read without a member", () => {
      expect(failure("parameters").message).toBe(
        "`parameters` can only be read as `parameters.<name>`.",
      );
      expect(failure("scenario + 1").message).toBe(
        "`scenario` can only be read as `scenario.<name>`.",
      );
      expect(failure("scenario.1").message).toBe(
        "`scenario` can only be read as `scenario.<name>`.",
      );
    });
  });

  describe("Math", () => {
    it("lowers the supported members", () => {
      expect(parse("Math.PI")).toMatchObject({ kind: "constant", name: "PI" });
      expect(parse("Math.max(1, 2)")).toMatchObject({
        kind: "mathCall",
        fn: "max",
        args: [{ kind: "numberLit" }, { kind: "numberLit" }],
        span: { start: 0, length: 14 },
      });
      expect(parse("Math.max()")).toMatchObject({ kind: "mathCall", args: [] });
    });

    it("accepts a trailing comma in a wrapped call, as the formatter writes it", () => {
      expect(
        parse("Math.sqrt(\n  parameters.g / scenario.d,\n)"),
      ).toMatchObject({
        kind: "mathCall",
        fn: "sqrt",
        args: [{ kind: "binary", op: "/" }],
      });
      expect(parse("Math.max(1, 2,)")).toMatchObject({ args: [{}, {}] });
      expect(failure("Math.max(,)").message).toBe("Unexpected `,`.");
      expect(failure("Math.max(1 2)").message).toBe(
        "Expected `)` but found `2`.",
      );
    });

    it("refuses the unsupported uses", () => {
      expect(failure("Math.random()").message).toBe(
        "`Math.random` is not supported.",
      );
      expect(failure("Math.foo(1)").message).toBe(
        "`Math.foo` is not supported.",
      );
      expect(failure("Math.max").message).toBe(
        "`Math.max` can only be used as a function call.",
      );
      expect(failure("Math.PI()").message).toBe(
        "Only `Math.<fn>(...)` can be called.",
      );
      expect(failure("Math").message).toBe(
        "`Math` can only be read as `Math.<name>`.",
      );
    });
  });

  describe("operators", () => {
    it("follows JavaScript's precedence and associativity", () => {
      expect(parse("1 + 2 * 3")).toMatchObject({
        kind: "binary",
        op: "+",
        left: { kind: "numberLit", value: 1 },
        right: { kind: "binary", op: "*" },
      });
      expect(parse("(1 + 2) * 3")).toMatchObject({
        kind: "binary",
        op: "*",
        left: { kind: "binary", op: "+" },
      });
      expect(parse("2 ** 3 ** 2")).toMatchObject({
        kind: "binary",
        op: "**",
        left: { kind: "numberLit", value: 2 },
        right: { kind: "binary", op: "**" },
      });
      expect(parse("1 - 2 - 3")).toMatchObject({
        kind: "binary",
        op: "-",
        left: { kind: "binary", op: "-" },
        right: { kind: "numberLit", value: 3 },
      });
      expect(parse("a || b && c")).toMatchObject({
        kind: "binary",
        op: "||",
        right: { kind: "binary", op: "&&" },
      });
      expect(parse("1 < 2 == true")).toMatchObject({
        kind: "binary",
        op: "==",
        left: { kind: "binary", op: "<" },
      });
      expect(parse("a ? b : c ? d : e")).toMatchObject({
        kind: "cond",
        thenBranch: { kind: "localRef", name: "b" },
        elseBranch: { kind: "cond" },
      });
    });

    it("maps strict equality onto the HIR's equality", () => {
      expect(parse("a === b")).toMatchObject({ kind: "binary", op: "==" });
      expect(parse("a !== b")).toMatchObject({ kind: "binary", op: "!=" });
    });

    it("lowers the unary operators", () => {
      expect(parse("-1")).toMatchObject({
        kind: "unary",
        op: "-",
        operand: { kind: "numberLit", value: 1 },
        span: { start: 0, length: 2 },
      });
      expect(parse("!-x")).toMatchObject({
        kind: "unary",
        op: "!",
        operand: { kind: "unary", op: "-" },
      });
    });

    it("refuses a negated operand before **, as JavaScript does", () => {
      expect(failure("-2 ** 2").message).toBe(
        "Put parentheses around a negated or inverted operand before `**`.",
      );
      expect(parse("(-2) ** 2")).toMatchObject({ kind: "binary", op: "**" });
      expect(parse("2 ** -1")).toMatchObject({
        kind: "binary",
        op: "**",
        right: { kind: "unary", op: "-" },
      });
    });
  });

  describe("spans and ids", () => {
    it("spans every node over its own source text", () => {
      const source = "parameters.rate * (2 + scenario.k)";
      const expr = parse(source);
      expect(text(source, expr)).toBe(source);
      if (expr.kind !== "binary" || expr.right.kind !== "binary") {
        throw new Error("unexpected shape");
      }
      expect(text(source, expr.left)).toBe("parameters.rate");
      expect(text(source, expr.right)).toBe("2 + scenario.k");
      expect(text(source, expr.right.right)).toBe("scenario.k");
    });

    it("gives every node a distinct id", () => {
      const ids: number[] = [];
      walkHir(parse("Math.max(parameters.n, a ? -b : c) * 2 ** 3"), (node) => {
        ids.push(node.id);
      });
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("what it refuses", () => {
    it.each([
      ["", "Expected an expression."],
      ["1 +", "Expected an expression."],
      ["1 2", "Unexpected `2`."],
      ["a; b", "Unexpected character `;`."],
      ["{}", "Unexpected character `{`."],
      ["x = 1", "Unexpected character `=`."],
      ["a => a", "Unexpected character `=`."],
      ["`t`", "Unexpected character ```."],
      ['"text"', 'Unexpected character `"`.'],
      ["'text'", "Unexpected character `'`."],
      ['scenario["k"]', "Unexpected character `[`."],
      ["[1, 2]", "Unexpected character `[`."],
      ["a ?? b", "Unexpected `?`."],
      ["xs.length", "Unexpected `.`."],
      ["range(3)", "Only `Math.<fn>(...)` can be called."],
      ["1 /* note */", "Unexpected `*`."],
      ["0x10", "Unexpected `x10`."],
      ["1_000", "Unexpected `_000`."],
      ["null.x", "Unexpected `.`."],
      ['(0, eval)("globalThis.x = 1"), 1', 'Unexpected character `"`.'],
      ["(0, eval)(1), 1", "Expected `)` but found `,`."],
      ['eval("globalThis.x = 1")', 'Unexpected character `"`.'],
      ["eval(1)", "Only `Math.<fn>(...)` can be called."],
      ['Function("return this")()', 'Unexpected character `"`.'],
      ['({}).constructor.constructor("x")()', "Unexpected character `{`."],
      ["top.x = 1", "Unexpected character `=`."],
      ["top.x", "Unexpected `.`."],
      ["(async () => 1)()", "Unexpected character `=`."],
      ["new Date()", "Unexpected `Date`."],
      ["typeof x", "Unexpected `x`."],
      ["Math.constructor(1)", "`Math.constructor` is not supported."],
      ["parameters.constructor.constructor", "Unexpected `.`."],
    ])("%s", (source, message) => {
      expect(failure(source).message).toBe(message);
    });

    it("positions the diagnostic on the offending token", () => {
      expect(failure("1 + * 2")).toMatchObject({
        code: "hir:parse",
        severity: "error",
        span: { start: 4, length: 1 },
      });
      expect(failure("1 +").span).toEqual({ start: 3, length: 0 });
    });

    it("bounds nesting depth", () => {
      const deep = `${"(".repeat(200)}1${")".repeat(200)}`;
      expect(failure(deep).message).toBe(
        "The expression is nested too deeply.",
      );
      expect(failure(`${"-".repeat(200)}1`).message).toBe(
        "The expression is nested too deeply.",
      );
      expect(parse(`${"(".repeat(50)}1${")".repeat(50)}`)).toMatchObject({
        kind: "numberLit",
      });
    });
  });

  describe("evaluates through the interpreter", () => {
    const bindings: HirInterpretBindings = {
      parameters: { rate: 2, enabled: true },
      scenario: { k: 1.4, population: 1000, infected_ratio: 0.1 },
    };

    it.each<[string, HirValue]>([
      ["parameters.rate * 2 + 1", 5],
      ["scenario.population * scenario.infected_ratio", 100],
      ["Math.round(2.5)", 3],
      ["Math.max(1, 2, 3)", 3],
      ["Math.PI > 3", true],
      ["1 + 2 * 3 ** 2", 19],
      ["2 ** 3 ** 2", 512],
      ["10 % 4", 2],
      ["7 / 2", 3.5],
      ["-(1 + 2)", -3],
      ["- -1", 1],
      ["2 ** -1", 0.5],
      ["parameters.enabled ? 1 : 2", 1],
      ["1 < 2 && 2 < 3", true],
      ["!(1 == 2)", true],
      ["1 === 1.0", true],
      ["1 / 0", Infinity],
    ])("%s", (source, expected) => {
      expect(evaluate(source, bindings)).toEqual(expected);
    });

    it("reports unknown names through the interpreter", () => {
      expect(() => evaluate("i + 1")).toThrow("Unknown identifier `i`.");
      expect(() => evaluate("scenario.missing")).toThrow(
        "Unknown scenario parameter `missing`.",
      );
      expect(() => evaluate("parameters.constructor")).toThrow(
        "Unknown parameter `constructor`.",
      );
    });
  });
});
