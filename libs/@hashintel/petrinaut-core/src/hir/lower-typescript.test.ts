import { describe, expect, it } from "vitest";

import { walkHir } from "./hir";
import { lowerTypeScriptToHir } from "./lower-typescript";

import type { HirExpr } from "./hir";

function lowerOk(
  code: string,
  surface: "dynamics" | "lambda" | "kernel" | "metric",
) {
  const result = lowerTypeScriptToHir(code, surface);
  if (!result.ok) {
    throw new Error(
      `Expected lowering to succeed, got: ${result.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join("; ")}`,
    );
  }
  return result.fn;
}

function lowerErr(
  code: string,
  surface: "dynamics" | "lambda" | "kernel" | "metric",
) {
  const result = lowerTypeScriptToHir(code, surface);
  if (result.ok) {
    throw new Error("Expected lowering to fail");
  }
  return result.diagnostics;
}

describe("lowerTypeScriptToHir", () => {
  describe("module shape", () => {
    it("lowers the default dynamics template", () => {
      const fn = lowerOk(
        `export default Dynamics((tokens, parameters) => {
  return tokens.map(({ x, y }) => {
    return { x: 1, y: 1 };
  });
});`,
        "dynamics",
      );
      expect(fn.surface).toBe("dynamics");
      expect(fn.params.map((parameter) => parameter.name)).toEqual([
        "tokens",
        "parameters",
      ]);
      expect(fn.body.kind).toBe("arrayMap");
    });

    it("rejects a missing default export with a full-file span", () => {
      const [diagnostic] = lowerErr(`const x = 1;`, "lambda");
      expect(diagnostic!.code).toBe("hir:unsupported-statement");
    });

    it("rejects the wrong constructor", () => {
      const [diagnostic] = lowerErr(
        `export default Lambda((input) => true);`,
        "kernel",
      );
      expect(diagnostic!.code).toBe("hir:missing-constructor");
    });

    it("short-circuits on syntax errors with parse diagnostics", () => {
      const diagnostics = lowerErr(
        `export default Lambda((input) => { return 1 + ; });`,
        "lambda",
      );
      expect(diagnostics[0]!.code).toBe("hir:parse-error");
      expect(diagnostics[0]!.span.start).toBeGreaterThan(0);
    });
  });

  describe("expressions", () => {
    it("lowers parameters access to paramRef", () => {
      const fn = lowerOk(
        `export default Lambda((input, parameters) => parameters.rate * 2);`,
        "lambda",
      );
      expect(fn.body).toMatchObject({
        kind: "binary",
        op: "*",
        left: { kind: "paramRef", name: "rate" },
        right: { kind: "numberLit", value: 2 },
      });
    });

    it("keeps exact numeric literals", () => {
      const fn = lowerOk(`export default Lambda((input) => 1e-9);`, "lambda");
      expect(fn.body).toMatchObject({ kind: "numberLit", raw: "1e-9" });
    });

    it("lowers token field access chains", () => {
      const fn = lowerOk(
        `export default Lambda((input, parameters) => input.Pool[0].x > 1);`,
        "lambda",
      );
      expect(fn.body).toMatchObject({
        kind: "binary",
        op: ">",
        left: {
          kind: "fieldAccess",
          field: "x",
          target: {
            kind: "indexAccess",
            target: { kind: "fieldAccess", field: "Pool" },
          },
        },
      });
    });

    it("lowers blocks with const bindings to let", () => {
      const fn = lowerOk(
        `export default Lambda((input, parameters) => {
  const rate = parameters.base * 2;
  return rate + 1;
});`,
        "lambda",
      );
      expect(fn.body.kind).toBe("let");
      const letNode = fn.body as Extract<HirExpr, { kind: "let" }>;
      expect(letNode.bindings[0]!.name).toBe("rate");
      expect(letNode.body.kind).toBe("binary");
    });

    it("desugars destructured map params to field accesses", () => {
      const fn = lowerOk(
        `export default Dynamics((tokens, parameters) => tokens.map(({ x }) => ({ x: x * 2 })));`,
        "dynamics",
      );
      const mapNode = fn.body as Extract<HirExpr, { kind: "arrayMap" }>;
      const record = mapNode.body as Extract<HirExpr, { kind: "recordLit" }>;
      expect(record.entries[0]!.value).toMatchObject({
        kind: "binary",
        left: {
          kind: "fieldAccess",
          field: "x",
          target: { kind: "localRef", name: "__element" },
        },
      });
    });

    it("supports .length and index parameters", () => {
      const fn = lowerOk(
        `export default Dynamics((tokens) => tokens.map((token, index) => ({ x: index / tokens.length })));`,
        "dynamics",
      );
      const mapNode = fn.body as Extract<HirExpr, { kind: "arrayMap" }>;
      expect(mapNode.indexParam?.name).toBe("index");
      const record = mapNode.body as Extract<HirExpr, { kind: "recordLit" }>;
      expect(record.entries[0]!.value).toMatchObject({
        kind: "binary",
        op: "/",
        right: { kind: "length" },
      });
    });

    it("unwraps type assertions and parentheses", () => {
      const fn = lowerOk(
        `export default Lambda((input) => ((1 as number)) + 2);`,
        "lambda",
      );
      expect(fn.body).toMatchObject({
        kind: "binary",
        left: { kind: "numberLit", value: 1 },
      });
    });
  });

  describe("distributions", () => {
    it("lowers Distribution constructors", () => {
      const fn = lowerOk(
        `export default TransitionKernel((input, parameters) => ({
  Out: [{ x: Distribution.Gaussian(0, parameters.sigma) }],
}));`,
        "kernel",
      );
      const record = fn.body as Extract<HirExpr, { kind: "recordLit" }>;
      const tokens = record.entries[0]!.value as Extract<
        HirExpr,
        { kind: "arrayLit" }
      >;
      const token = tokens.elements[0] as Extract<
        HirExpr,
        { kind: "recordLit" }
      >;
      expect(token.entries[0]!.value).toMatchObject({
        kind: "distribution",
        dist: "gaussian",
        args: [{ kind: "numberLit" }, { kind: "paramRef", name: "sigma" }],
      });
    });

    it("distinguishes distribution .map from array .map", () => {
      const fn = lowerOk(
        `export default TransitionKernel((input) => {
  const base = Distribution.Uniform(0, 1);
  const scaled = base.map((value) => value * 10);
  return { Out: [{ x: scaled }] };
});`,
        "kernel",
      );
      const letNode = fn.body as Extract<HirExpr, { kind: "let" }>;
      expect(letNode.bindings[1]!.value.kind).toBe("distributionMap");
    });

    it("expands Math function references in distribution .map", () => {
      const fn = lowerOk(
        `export default TransitionKernel((input) => ({
  Out: [{ x: Distribution.Gaussian(0, 10).map(Math.cos) }],
}));`,
        "kernel",
      );
      const record = fn.body as Extract<HirExpr, { kind: "recordLit" }>;
      const tokens = record.entries[0]!.value as Extract<
        HirExpr,
        { kind: "arrayLit" }
      >;
      const token = tokens.elements[0] as Extract<
        HirExpr,
        { kind: "recordLit" }
      >;
      expect(token.entries[0]!.value).toMatchObject({
        kind: "distributionMap",
        body: { kind: "mathCall", fn: "cos" },
      });
    });
  });

  describe("destructuring", () => {
    it("lowers const { a, b } = parameters to parameter reads", () => {
      const fn = lowerOk(
        `export default Lambda((input, parameters) => {
  const { rate, threshold } = parameters;
  return rate * threshold;
});`,
        "lambda",
      );
      const letNode = fn.body as Extract<HirExpr, { kind: "let" }>;
      expect(letNode.bindings).toHaveLength(2);
      expect(letNode.bindings[0]).toMatchObject({
        name: "rate",
        value: { kind: "paramRef", name: "rate" },
      });
      expect(letNode.bindings[1]).toMatchObject({
        name: "threshold",
        value: { kind: "paramRef", name: "threshold" },
      });
    });

    it("supports renames when destructuring parameters", () => {
      const fn = lowerOk(
        `export default Lambda((input, parameters) => {
  const { rate: r } = parameters;
  return r;
});`,
        "lambda",
      );
      const letNode = fn.body as Extract<HirExpr, { kind: "let" }>;
      expect(letNode.bindings[0]).toMatchObject({
        name: "r",
        value: { kind: "paramRef", name: "rate" },
      });
    });

    it("lowers object destructuring from token expressions", () => {
      const fn = lowerOk(
        `export default Lambda((tokens, parameters) => {
  const { x, y } = tokens.Space[0];
  return x + y;
});`,
        "lambda",
      );
      const letNode = fn.body as Extract<HirExpr, { kind: "let" }>;
      // temp binding + two field reads
      expect(letNode.bindings).toHaveLength(3);
      expect(letNode.bindings[1]).toMatchObject({
        name: "x",
        value: { kind: "fieldAccess", field: "x" },
      });
      expect(letNode.bindings[2]).toMatchObject({
        name: "y",
        value: { kind: "fieldAccess", field: "y" },
      });
    });

    it("lowers array destructuring to index reads", () => {
      const fn = lowerOk(
        `export default Lambda((tokens, parameters) => {
  const [a, b] = tokens.Space;
  return a.x - b.x;
});`,
        "lambda",
      );
      const letNode = fn.body as Extract<HirExpr, { kind: "let" }>;
      expect(letNode.bindings[1]).toMatchObject({
        name: "a",
        value: { kind: "indexAccess", index: { kind: "numberLit", value: 0 } },
      });
      expect(letNode.bindings[2]).toMatchObject({
        name: "b",
        value: { kind: "indexAccess", index: { kind: "numberLit", value: 1 } },
      });
    });

    it("does not create a temp binding when destructuring a local", () => {
      const fn = lowerOk(
        `export default Lambda((tokens, parameters) => {
  const token = tokens.Space[0];
  const { x } = token;
  return x;
});`,
        "lambda",
      );
      const letNode = fn.body as Extract<HirExpr, { kind: "let" }>;
      expect(letNode.bindings.map((binding) => binding.name)).toEqual([
        "token",
        "x",
      ]);
    });

    it("supports destructured function parameters", () => {
      const fn = lowerOk(
        `export default Lambda(({ Pool }, { rate }) => Pool[0].x * rate);`,
        "lambda",
      );
      expect(fn.params.map((parameter) => parameter.name)).toEqual([
        "__input",
        "__parameters",
      ]);
      expect(fn.body).toMatchObject({
        kind: "binary",
        left: {
          kind: "fieldAccess",
          field: "x",
          target: {
            kind: "indexAccess",
            target: { kind: "fieldAccess", field: "Pool" },
          },
        },
        right: { kind: "paramRef", name: "rate" },
      });
    });

    it("rejects rest and defaults in destructuring", () => {
      expect(
        lowerErr(
          `export default Lambda((input, parameters) => {
  const { a = 1 } = parameters;
  return a;
});`,
          "lambda",
        )[0]!.code,
      ).toBe("hir:destructured-binding");
      expect(
        lowerErr(
          `export default Lambda((input, parameters) => {
  const { ...rest } = parameters;
  return 1;
});`,
          "lambda",
        )[0]!.code,
      ).toBe("hir:destructured-binding");
    });
  });

  describe("guard clauses and early returns", () => {
    it("lowers a guard if + early return to a conditional", () => {
      const fn = lowerOk(
        `export default Lambda((input, parameters) => {
  const order = input.OpenOrders[0];
  if (order.age < order.promised_lead_time) return 0;
  return parameters.rate * (order.priority > 0.5 ? 1.8 : 1);
});`,
        "lambda",
      );
      const letNode = fn.body as Extract<HirExpr, { kind: "let" }>;
      expect(letNode.bindings[0]!.name).toBe("order");
      expect(letNode.body).toMatchObject({
        kind: "cond",
        condition: { kind: "binary", op: "<" },
        thenBranch: { kind: "numberLit", value: 0 },
        elseBranch: { kind: "binary", op: "*" },
      });
    });

    it("lowers if/else where both branches return", () => {
      const fn = lowerOk(
        `export default Lambda((input, parameters) => {
  if (parameters.enabled) {
    return parameters.rate;
  } else {
    return 0;
  }
});`,
        "lambda",
      );
      expect(fn.body).toMatchObject({
        kind: "cond",
        thenBranch: { kind: "paramRef", name: "rate" },
        elseBranch: { kind: "numberLit", value: 0 },
      });
    });

    it("supports chained guards with bindings in between", () => {
      const fn = lowerOk(
        `export default Lambda((input, parameters) => {
  if (input.Pool.length == 0) return 0;
  const first = input.Pool[0];
  if (first.x < 0) return 0.5;
  return first.x;
});`,
        "lambda",
      );
      expect(fn.body).toMatchObject({
        kind: "cond",
        elseBranch: {
          kind: "let",
          body: { kind: "cond" },
        },
      });
    });

    it("rejects unreachable code after return", () => {
      const [diagnostic] = lowerErr(
        `export default Lambda((input) => {
  return 1;
  return 2;
});`,
        "lambda",
      );
      expect(diagnostic!.code).toBe("hir:unreachable-code");
    });

    it("rejects if branches that do not return", () => {
      const [diagnostic] = lowerErr(
        `export default Lambda((input, parameters) => {
  if (parameters.enabled) {
    const x = 1;
  }
  return 1;
});`,
        "lambda",
      );
      expect(diagnostic!.code).toBe("hir:missing-return");
    });
  });

  describe("out-of-subset rejections with positions", () => {
    it("rejects let bindings", () => {
      const code = `export default Lambda((input) => {
  let x = 1;
  return x;
});`;
      const [diagnostic] = lowerErr(code, "lambda");
      expect(diagnostic!.code).toBe("hir:mutable-binding");
      expect(code.slice(diagnostic!.span.start).startsWith("let x = 1")).toBe(
        true,
      );
    });

    it("rejects unknown identifiers at the right span", () => {
      const code = `export default Lambda((input) => wat + 1);`;
      const [diagnostic] = lowerErr(code, "lambda");
      expect(diagnostic!.code).toBe("hir:unknown-identifier");
      expect(
        code.slice(
          diagnostic!.span.start,
          diagnostic!.span.start + diagnostic!.span.length,
        ),
      ).toBe("wat");
    });

    it("rejects arbitrary function calls", () => {
      const [diagnostic] = lowerErr(
        `export default Lambda((input) => fetch("x"));`,
        "lambda",
      );
      expect(diagnostic!.code).toBe("hir:unsupported-call");
    });

    it("rejects object spread", () => {
      const [diagnostic] = lowerErr(
        `export default TransitionKernel((input) => ({
  Out: input.In.map((token) => ({ ...token })),
}));`,
        "kernel",
      );
      expect(diagnostic!.code).toBe("hir:spread");
    });

    it("rejects bare use of the parameters object", () => {
      const [diagnostic] = lowerErr(
        `export default Lambda((input, parameters) => parameters);`,
        "lambda",
      );
      expect(diagnostic!.code).toBe("hir:bare-parameters-object");
    });
  });

  describe("reduce and concat", () => {
    it("lowers .reduce with (acc, element) callbacks", () => {
      const fn = lowerOk(
        `export default Lambda((input) => input.Pool.reduce((sum, token) => sum + token.x, 0));`,
        "lambda",
      );
      expect(fn.body.kind).toBe("arrayReduce");
      const reduce = fn.body as Extract<HirExpr, { kind: "arrayReduce" }>;
      expect(reduce.accParam.name).toBe("sum");
      expect(reduce.param.name).toBe("token");
      expect(reduce.indexParam).toBeUndefined();
      expect(reduce.initial.kind).toBe("numberLit");
      expect(reduce.body.kind).toBe("binary");
    });

    it("lowers .reduce with an index parameter", () => {
      const fn = lowerOk(
        `export default Lambda((input) => input.Pool.reduce((acc, token, index) => acc + index, 0));`,
        "lambda",
      );
      const reduce = fn.body as Extract<HirExpr, { kind: "arrayReduce" }>;
      expect(reduce.indexParam?.name).toBe("index");
    });

    it("rejects .reduce without an initial value", () => {
      const [diagnostic] = lowerErr(
        `export default Lambda((input) => input.Pool.reduce((sum, token) => sum + token.x));`,
        "lambda",
      );
      expect(diagnostic!.code).toBe("hir:reduce-arity");
    });

    it("rejects .reduce callbacks with one parameter", () => {
      const [diagnostic] = lowerErr(
        `export default Lambda((input) => input.Pool.reduce((sum) => sum, 0));`,
        "lambda",
      );
      expect(diagnostic!.code).toBe("hir:reduce-arity");
    });

    it("lowers single-argument .concat", () => {
      const fn = lowerOk(
        `export default Lambda((input) => input.Pool.concat(input.Buffer).length);`,
        "lambda",
      );
      expect(fn.body.kind).toBe("length");
      const length = fn.body as Extract<HirExpr, { kind: "length" }>;
      expect(length.target.kind).toBe("arrayConcat");
    });

    it("rejects multi-argument .concat", () => {
      const [diagnostic] = lowerErr(
        `export default Lambda((input) => input.Pool.concat(input.A, input.B).length);`,
        "lambda",
      );
      expect(diagnostic!.code).toBe("hir:concat-arity");
    });
  });

  describe("metric surface", () => {
    it("lowers a metric body with state as the only function parameter", () => {
      const fn = lowerOk(
        `const pool = state.places.Pool.tokens;
if (pool.length === 0) return 0;
return pool.reduce((sum, t) => sum + t.x, 0) / pool.length;`,
        "metric",
      );
      expect(fn.surface).toBe("metric");
      expect(fn.params.map((parameter) => parameter.name)).toEqual(["state"]);
      expect(fn.body.kind).toBe("let");
    });

    it("lowers ambient `parameters.<name>` reads to paramRefs", () => {
      const fn = lowerOk(
        `return state.places.Pool.count * parameters.weight;`,
        "metric",
      );
      const paramRefs: string[] = [];
      walkHir(fn.body, (node) => {
        if (node.kind === "paramRef") {
          paramRefs.push(node.name);
        }
      });
      expect(paramRefs).toEqual(["weight"]);
    });

    it("lowers `const { x } = parameters` in a metric to paramRefs", () => {
      const fn = lowerOk(
        `const { weight } = parameters;
return state.places.Pool.count * weight;`,
        "metric",
      );
      const paramRefs: string[] = [];
      walkHir(fn.body, (node) => {
        if (node.kind === "paramRef") {
          paramRefs.push(node.name);
        }
      });
      expect(paramRefs).toEqual(["weight"]);
    });

    it("rejects bare `parameters` in a metric", () => {
      const [diagnostic] = lowerErr(`return parameters;`, "metric");
      expect(diagnostic!.code).toBe("hir:bare-parameters-object");
    });

    it("maps node spans onto the raw metric body", () => {
      const code = `const total = state.places.Pool.count;
return total;`;
      const fn = lowerOk(code, "metric");
      const letExpr = fn.body as Extract<HirExpr, { kind: "let" }>;
      const binding = letExpr.bindings[0]!;
      expect(
        code.slice(
          binding.nameSpan.start,
          binding.nameSpan.start + binding.nameSpan.length,
        ),
      ).toBe("total");
      expect(
        code.slice(
          binding.value.span.start,
          binding.value.span.start + binding.value.span.length,
        ),
      ).toBe("state.places.Pool.count");
    });

    it("maps diagnostic spans onto the raw metric body", () => {
      const code = `const a = 1;
return missing;`;
      const [diagnostic] = lowerErr(code, "metric");
      expect(diagnostic!.code).toBe("hir:unknown-identifier");
      expect(
        code.slice(
          diagnostic!.span.start,
          diagnostic!.span.start + diagnostic!.span.length,
        ),
      ).toBe("missing");
    });

    it("shifts parse-error spans onto the raw metric body", () => {
      const code = `return 1 +;`;
      const [diagnostic] = lowerErr(code, "metric");
      expect(diagnostic!.code).toBe("hir:parse-error");
      expect(diagnostic!.span.start).toBeLessThanOrEqual(code.length);
    });

    it("requires the metric body to end in a return", () => {
      const [diagnostic] = lowerErr(`const a = 1;`, "metric");
      expect(diagnostic!.code).toBe("hir:missing-return");
    });
  });

  describe("spans", () => {
    it("every node span maps back into the source text", () => {
      const code = `export default Lambda((input, parameters) => {
  const a = parameters.alpha;
  return a > 0 ? a * 2 : Math.abs(a);
});`;
      const fn = lowerOk(code, "lambda");
      const stack = [fn.body];
      while (stack.length > 0) {
        const node = stack.pop()!;
        expect(node.span.start).toBeGreaterThanOrEqual(0);
        expect(node.span.start + node.span.length).toBeLessThanOrEqual(
          code.length,
        );
        switch (node.kind) {
          case "binary":
            stack.push(node.left, node.right);
            break;
          case "let":
            stack.push(...node.bindings.map((binding) => binding.value));
            stack.push(node.body);
            break;
          case "cond":
            stack.push(node.condition, node.thenBranch, node.elseBranch);
            break;
          case "mathCall":
            stack.push(...node.args);
            break;
          default:
            break;
        }
      }
    });
  });
});
