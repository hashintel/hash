import { describe, expect, it } from "vitest";

import { lowerTypeScriptToHir } from "../../../hir/lower-typescript";
import { classifyDynamics } from "./classify-dynamics";

import type { HirFunction } from "../../../hir/hir";
import type { DynamicsTerm } from "./classify-dynamics";

/** The lowered HIR of a dynamics module or body over `arity` tokens. */
const dynamicsHir = (code: string, arity: number): HirFunction => {
  const lowered = lowerTypeScriptToHir(code, "dynamics", { arity });
  if (!lowered.ok) {
    throw new Error(JSON.stringify(lowered.diagnostics));
  }
  return lowered.fn;
};

const term = (code: string, arity = 1): DynamicsTerm => ({
  hir: dynamicsHir(code, arity),
  arity,
});

const fields = ["x", "y"];

const coefficients = (
  terms: DynamicsTerm[],
  parameters: Record<string, number> = { rate: 2 },
) => {
  const dynamics = classifyDynamics(terms, fields);
  if (dynamics.kind !== "affine") {
    throw new Error(`expected affine dynamics, got ${dynamics.kind}`);
  }
  return Object.fromEntries(
    [...dynamics.rows].map(([field, form]) => [
      field,
      {
        // `+ 0` turns a negative zero into zero.
        constant: form.constant(parameters) + 0,
        ...Object.fromEntries(
          [...form.coefficients].map(([input, fn]) => [
            input,
            fn(parameters) + 0,
          ]),
        ),
      },
    ]),
  );
};

describe("classifyDynamics", () => {
  it("is coupled without terms", () => {
    expect(classifyDynamics([], fields)).toEqual({ kind: "coupled" });
  });

  it("is coupled for a term without HIR", () => {
    expect(classifyDynamics([{ hir: undefined, arity: 1 }], fields)).toEqual({
      kind: "coupled",
    });
  });

  it("is coupled for a term over two tokens", () => {
    const pair = term(
      "export default Dynamics((a, b) => [{ x: b.x - a.x }, { x: a.x - b.x }]);",
      2,
    );
    expect(classifyDynamics([pair], fields)).toEqual({ kind: "coupled" });
  });

  it("is affine for a constant drift read from a parameter", () => {
    const drift = term(
      "export default Dynamics((token, parameters) => ({ x: parameters.rate }));",
    );
    expect(coefficients([drift])).toEqual({
      x: { constant: 2 },
      y: { constant: 0 },
    });
  });

  it("is affine for linear terms with run-constant coefficients", () => {
    const linear = term(
      `export default Dynamics((token, parameters) => {
        const k = parameters.rate * 3;
        const damping = -k / 2;
        return { x: token.y + 1, y: damping * token.y - token.x * Math.PI };
      });`,
    );
    expect(coefficients([linear])).toEqual({
      x: { constant: 1, y: 1 },
      y: { constant: 0, y: -3, x: -Math.PI },
    });
  });

  it("is affine for a body that destructures the token", () => {
    const body = term(`const { x } = token;
return { x: 2 * x };`);
    expect(coefficients([body])).toEqual({
      x: { constant: 0, x: 2 },
      y: { constant: 0 },
    });
  });

  it("is affine for a body that reads the token directly", () => {
    const body = term("return { x: 2 * token.x };");
    expect(coefficients([body])).toEqual({
      x: { constant: 0, x: 2 },
      y: { constant: 0 },
    });
  });

  it("adds up the rows of several affine terms", () => {
    const drift = term(
      "export default Dynamics((token, parameters) => ({ x: parameters.rate }));",
    );
    const linear = term(
      "export default Dynamics((token) => ({ x: 2 * token.x, y: token.x }));",
    );
    expect(coefficients([drift, linear])).toEqual({
      x: { constant: 2, x: 2 },
      y: { constant: 0, x: 1 },
    });
  });

  it("is independent for a nonlinear term in the token's attributes", () => {
    const sine = term(
      "export default Dynamics((token) => ({ x: Math.sin(token.x) }));",
    );
    expect(classifyDynamics([sine], fields)).toEqual({ kind: "independent" });
  });

  it("is independent for a product of two attributes", () => {
    const product = term(
      "export default Dynamics((token) => ({ x: token.x * token.y }));",
    );
    expect(classifyDynamics([product], fields)).toEqual({
      kind: "independent",
    });
  });

  it("is independent for a coefficient read from a non-real attribute", () => {
    const scaled = term(
      "export default Dynamics((token) => ({ x: token.k * token.x }));",
    );
    expect(classifyDynamics([scaled], fields)).toEqual({
      kind: "independent",
    });
  });

  it("is independent when one of several one-token terms is not affine", () => {
    const drift = term(
      "export default Dynamics((token, parameters) => ({ x: parameters.rate }));",
    );
    const sine = term(
      "export default Dynamics((token) => ({ x: Math.sin(token.x) }));",
    );
    expect(classifyDynamics([drift, sine], fields)).toEqual({
      kind: "independent",
    });
  });
});
