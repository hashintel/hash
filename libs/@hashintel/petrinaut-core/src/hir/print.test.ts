import { describe, expect, it } from "vitest";

import { walkHir } from "./hir";
import { lowerTypeScriptToHir } from "./lower-typescript";
import { hirExpressionToTypeScript } from "./print";

import type { HirExpr, HirFunction, Span } from "./hir";

function lowerExpression(code: string): HirFunction {
  const result = lowerTypeScriptToHir(code, "scenario-expression");
  if (!result.ok) {
    throw new Error(
      `Expected \`${code}\` to lower, got: ${result.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join("; ")}`,
    );
  }
  return result.fn;
}

/** Ids and spans differ between lowerings of different source texts; the
 * printer's contract is over the remaining structure. */
const LOCATION_KEYS = new Set([
  "id",
  "span",
  "fieldSpan",
  "keySpan",
  "nameSpan",
]);

function stripLocations(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripLocations);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !LOCATION_KEYS.has(key))
        .map(([key, entry]) => [key, stripLocations(entry)]),
    );
  }
  return value;
}

/**
 * Every corpus expression must satisfy the printer's contract:
 * `lower(print(lower(src)))` is structurally identical to `lower(src)`, and
 * printing is idempotent.
 */
const CORPUS: string[] = [
  // Literals and raw-text preservation.
  "1e-9",
  "0x10 + 2",
  "-1.5",
  "1_000 * 2",
  '"he said \\"hi\\" \\\\ done"',
  "false && true",
  // Constants.
  "Math.PI * Math.E",
  "parameters.a === Infinity ? 0 : NaN",
  // Parameter and scenario reads.
  "parameters.rate * 2",
  "scenario.scale + 1",
  // Unary operators.
  "-parameters.x",
  "+parameters.x",
  "-(-parameters.x)",
  "!(parameters.on && parameters.off)",
  "-(parameters.a + parameters.b)",
  // Binary precedence and associativity.
  "(parameters.a + parameters.b) * parameters.c",
  "parameters.a - (parameters.b - parameters.c)",
  "parameters.a - parameters.b - parameters.c",
  "parameters.a / parameters.b / parameters.c",
  "parameters.a + parameters.b * parameters.c",
  "1 - -2",
  "2 ** 3 ** 2",
  "(2 ** 3) ** 2",
  "(-2) ** 2",
  "2 ** -3",
  "-(2 ** 3)",
  "(parameters.a || parameters.b) && parameters.c",
  "parameters.a || parameters.b && parameters.c",
  "parameters.a < 1 === parameters.b > 2",
  "(parameters.a === parameters.b) < parameters.c",
  "parameters.a % parameters.b % parameters.c",
  // Conditionals.
  "true ? 1 : 2",
  "(parameters.a ? 1 : 2) ? 3 : 4",
  "parameters.a ? parameters.b ? 1 : 2 : parameters.c ? 3 : 4",
  "!(parameters.a ? 1 : 2)",
  "(parameters.a ? 1 : 2) + 3",
  // Member and index access.
  "{ a: 1 }.a",
  "{ list: [1, 2] }.list.length",
  '{ length: 2 }["length"]',
  '{ "b-c": 2, d: 3 }["b-c"]',
  "[1, 2, 3][parameters.i]",
  "{ a: { b: [1, 2] } }.a.b[1]",
  "(parameters.a ? [1] : [2]).length",
  // Records and arrays.
  "{}",
  "[]",
  "{ a: 1, b: parameters.x + 1 }",
  "[[1, 2], [3]]",
  // Math calls.
  "Math.max(Math.min(parameters.a, 1), 0)",
  "Math.random()",
  "Math.pow(Math.abs(parameters.x), 2)",
  // Strings and UUIDs.
  'scenario.label.startsWith("a-")',
  'parameters.kind === "fast" ? 2 : 1',
  "Uuid.generate()",
  "Uuid.from(parameters.id)",
  // range and comprehensions.
  "range(1, 10, 2)",
  "range(3).map((i) => i * 2)",
  "range(3).map((x, i) => x + i)",
  "range(3).map((i) => ({ value: i }))",
  "range(2).map((i) => range(i).map((j) => i * j))",
  "Array.from({ length: 3 }, (i) => i + 1)",
  // Callback block bodies (let bindings, guards, terminal if/else).
  "range(3).map((i) => { const y = i * 2; return y; })",
  "range(4).map((i) => { if (i > 1) { return 0; } const y = i + 1; return y * y; })",
  "range(2).map((i) => { if (i > 0) { const a = i * 2; return a; } else { return 0; } })",
  "range(2).map((i) => { const a = 1; const b = a + i; return b; })",
  // Reduce and concat.
  "range(3).reduce((acc, x) => acc + x, 0)",
  "range(3).reduce((acc, x, i) => acc + x * i, 100)",
  "range(3).reduce((acc, x) => { const doubled = x * 2; return acc + doubled; }, 0)",
  "range(2).concat([5, 6])",
  // Distributions.
  "Distribution.Gaussian(0, 1)",
  "Distribution.Uniform(0, 1).map((s) => s * parameters.scale)",
  "Distribution.Lognormal(0, 0.5).map(Math.cos)",
  "Distribution.Gaussian(0, 1).map((s) => s + 1).map((t) => t * 2)",
  "(parameters.a ? Distribution.Gaussian(0, 1) : Distribution.Uniform(0, 1)).map((s) => s * 2)",
  "range(1).map((i) => { const d = Distribution.Gaussian(0, 1); return d.map((s) => s + i); })",
  // Calls with call arguments.
  "Math.max(range(3).reduce((acc, x) => acc + x, 0), parameters.floor)",
];

describe("hirExpressionToTypeScript", () => {
  describe("round-trip and idempotence over the corpus", () => {
    for (const source of CORPUS) {
      it(`round-trips \`${source}\``, () => {
        const lowered = lowerExpression(source);
        const printed = hirExpressionToTypeScript(lowered.body);
        const relowered = lowerExpression(printed);
        expect(stripLocations(relowered.body)).toEqual(
          stripLocations(lowered.body),
        );
        expect(hirExpressionToTypeScript(relowered.body)).toBe(printed);
      });
    }
  });

  it("the corpus covers every HIR expression node kind", () => {
    const seen = new Set<string>();
    for (const source of CORPUS) {
      walkHir(lowerExpression(source).body, (node) => {
        seen.add(node.kind);
      });
    }
    expect([...seen].sort()).toEqual(
      [
        "numberLit",
        "boolLit",
        "stringLit",
        "stringCall",
        "uuidGenerate",
        "uuidFrom",
        "constant",
        "localRef",
        "paramRef",
        "scenarioRef",
        "rangeCall",
        "fieldAccess",
        "indexAccess",
        "length",
        "unary",
        "binary",
        "cond",
        "let",
        "mathCall",
        "recordLit",
        "arrayLit",
        "arrayMap",
        "arrayReduce",
        "arrayConcat",
        "distribution",
        "distributionMap",
      ].sort(),
    );
  });

  describe("canonical formatting", () => {
    function print(source: string): string {
      return hirExpressionToTypeScript(lowerExpression(source).body);
    }

    it("normalizes spacing and drops redundant parentheses", () => {
      expect(print("(1)+( 2 *3)")).toBe("1 + 2 * 3");
      expect(print("((parameters.a)) ? (1) : (2)")).toBe(
        "parameters.a ? 1 : 2",
      );
    });

    it("preserves raw numeric literal text", () => {
      expect(print("1e-9*parameters.rate")).toBe("1e-9 * parameters.rate");
      expect(print("0x10 + 1_000")).toBe("0x10 + 1_000");
    });

    it("keeps parentheses required by associativity", () => {
      expect(print("parameters.a-(parameters.b-parameters.c)")).toBe(
        "parameters.a - (parameters.b - parameters.c)",
      );
      expect(print("parameters.a-parameters.b-parameters.c")).toBe(
        "parameters.a - parameters.b - parameters.c",
      );
      expect(print("(-2)**2")).toBe("(-2) ** 2");
      expect(print("2**-3")).toBe("2 ** -3");
    });

    it("prints sign-colliding unary chains with parentheses", () => {
      expect(print("-(-1)")).toBe("-(-1)");
      expect(print("-(-parameters.x)")).toBe("-(-parameters.x)");
    });

    it("prints strict equality for HIR equality operators", () => {
      expect(print("parameters.a==1")).toBe("parameters.a === 1");
      expect(print("parameters.a!==parameters.b")).toBe(
        "parameters.a !== parameters.b",
      );
    });

    it("prints double-quoted, escaped string literals", () => {
      expect(print("'it\\'s \"quoted\"'")).toBe('"it\'s \\"quoted\\""');
    });

    it("prints canonical callbacks, records and calls", () => {
      expect(print("range(3).map(i => i*2)")).toBe(
        "range(3).map((i) => i * 2)",
      );
      expect(print("range(3).map(i => ({v:i}))")).toBe(
        "range(3).map((i) => ({ v: i }))",
      );
      expect(print('{a:1,"b-c":2}')).toBe('{ a: 1, "b-c": 2 }');
      expect(print("Math.max( 1,2 )")).toBe("Math.max(1, 2)");
    });

    it("expands record shorthand to explicit entries", () => {
      expect(print("range(1).map((x) => ({ x }))")).toBe(
        "range(1).map((x) => ({ x: x }))",
      );
    });

    it("prints field access to `length` with bracket syntax", () => {
      expect(print('{ length: 2 }["length"]')).toBe('{ length: 2 }["length"]');
    });

    it("prints block callback bodies as single-line statements", () => {
      expect(
        print("range(3).map((i) => { const y = i * 2;\n  return y; })"),
      ).toBe("range(3).map((i) => { const y = i * 2; return y; })");
      expect(
        print(
          "range(4).map((i) => { if (i > 1) return 0; const y = i + 1; return y; })",
        ),
      ).toBe(
        "range(4).map((i) => { if (i > 1) { return 0; } const y = i + 1; return y; })",
      );
    });
  });

  describe("unprintable shapes throw instead of emitting wrong code", () => {
    const span: Span = { start: 0, length: 0 };

    function num(value: number): HirExpr {
      return { kind: "numberLit", value, raw: String(value), id: 0, span };
    }

    it("rejects a `let` in expression position", () => {
      const letExpr: HirExpr = {
        kind: "let",
        bindings: [{ name: "x", nameSpan: span, value: num(1) }],
        body: num(2),
        id: 1,
        span,
      };
      expect(() => hirExpressionToTypeScript(letExpr)).toThrow(
        /`let` in expression position/,
      );
    });

    it("rejects an `indexAccess` with a string-literal index", () => {
      const indexAccess: HirExpr = {
        kind: "indexAccess",
        target: { kind: "localRef", name: "xs", id: 0, span },
        index: { kind: "stringLit", value: "a", id: 1, span },
        id: 2,
        span,
      };
      expect(() => hirExpressionToTypeScript(indexAccess)).toThrow(
        /string-literal index/,
      );
    });

    it("rejects an `arrayMap` over a distribution-valued target", () => {
      const map: HirExpr = {
        kind: "arrayMap",
        target: {
          kind: "distribution",
          dist: "gaussian",
          args: [num(0), num(1)],
          id: 0,
          span,
        },
        param: { name: "x", span },
        body: { kind: "localRef", name: "x", id: 1, span },
        id: 2,
        span,
      };
      expect(() => hirExpressionToTypeScript(map)).toThrow(
        /would lower to `distributionMap`/,
      );
    });

    it("rejects a `distributionMap` over a non-distribution base", () => {
      const map: HirExpr = {
        kind: "distributionMap",
        base: { kind: "arrayLit", elements: [num(1)], id: 0, span },
        param: { name: "s", span },
        body: { kind: "localRef", name: "s", id: 1, span },
        id: 2,
        span,
      };
      expect(() => hirExpressionToTypeScript(map)).toThrow(
        /would lower to `arrayMap`/,
      );
    });

    it("rejects parameter names that are not identifiers", () => {
      const paramRef: HirExpr = {
        kind: "paramRef",
        name: "not a name",
        id: 0,
        span,
      };
      expect(() => hirExpressionToTypeScript(paramRef)).toThrow(
        /not an identifier/,
      );
    });

    it("rejects a hand-built numeric literal whose raw text is not a number", () => {
      const forged: HirExpr = {
        kind: "numberLit",
        value: 1,
        raw: "1); evil((",
        id: 0,
        span,
      };
      expect(() => hirExpressionToTypeScript(forged)).toThrow(
        /not a numeric literal/,
      );
    });
  });
});
