import { describe, expect, it } from "vitest";

import { lowerAndCheck } from "../../../hir/compile";
import { classifyDynamics } from "./classify-dynamics";

import type { HirFunction } from "../../../hir/hir";

/** The lowered HIR of a dynamics body, without the buffer compiler's shape checks. */
const dynamicsHir = (code: string): HirFunction => {
  const lowered = lowerAndCheck(
    `export default Dynamics(${code});`,
    "dynamics",
    null,
  );
  if (!lowered.ok) {
    throw new Error(JSON.stringify(lowered.diagnostics));
  }
  return lowered.fn;
};

const fields = ["x", "y"];

const coefficients = (
  hir: HirFunction,
  parameters: Record<string, number> = { rate: 2 },
) => {
  const dynamics = classifyDynamics(hir, fields);
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
  it("is coupled without HIR", () => {
    expect(classifyDynamics(undefined, fields)).toEqual({ kind: "coupled" });
  });

  it("is affine for a constant drift read from a parameter", () => {
    const hir = dynamicsHir(
      "(tokens, parameters) => tokens.map(() => ({ x: parameters.rate }))",
    );
    expect(coefficients(hir)).toEqual({
      x: { constant: 2 },
      y: { constant: 0 },
    });
  });

  it("is affine for linear terms with run-constant coefficients", () => {
    const hir = dynamicsHir(
      `(tokens, parameters) => {
        const k = parameters.rate * 3;
        return tokens.map((token) => {
          const damping = -k / 2;
          return { x: token.y + 1, y: damping * token.y - token.x * Math.PI };
        });
      }`,
    );
    expect(coefficients(hir)).toEqual({
      x: { constant: 1, y: 1 },
      y: { constant: 0, y: -3, x: -Math.PI },
    });
  });

  it("is affine for a destructured callback parameter", () => {
    const hir = dynamicsHir(
      "(tokens) => tokens.map(({ x }) => ({ x: 2 * x }))",
    );
    expect(coefficients(hir)).toEqual({
      x: { constant: 0, x: 2 },
      y: { constant: 0 },
    });
  });

  it("is independent for a nonlinear term in the token's attributes", () => {
    const hir = dynamicsHir(
      "(tokens) => tokens.map((token) => ({ x: Math.sin(token.x) }))",
    );
    expect(classifyDynamics(hir, fields)).toEqual({ kind: "independent" });
  });

  it("is independent for a product of two attributes", () => {
    const hir = dynamicsHir(
      "(tokens) => tokens.map((token) => ({ x: token.x * token.y }))",
    );
    expect(classifyDynamics(hir, fields)).toEqual({ kind: "independent" });
  });

  it("is independent for a coefficient read from a non-real attribute", () => {
    const hir = dynamicsHir(
      "(tokens) => tokens.map((token) => ({ x: token.k * token.x }))",
    );
    expect(classifyDynamics(hir, fields)).toEqual({ kind: "independent" });
  });

  it("is coupled when the callback reads the token index", () => {
    const hir = dynamicsHir(
      "(tokens) => tokens.map((token, index) => ({ x: index * token.x }))",
    );
    expect(classifyDynamics(hir, fields)).toEqual({ kind: "coupled" });
  });

  it("is coupled when the callback reads the tokens", () => {
    const hir = dynamicsHir(
      "(tokens) => tokens.map(() => ({ x: tokens.length }))",
    );
    expect(classifyDynamics(hir, fields)).toEqual({ kind: "coupled" });
  });

  it("is coupled when a binding outside the map reads the tokens", () => {
    const hir = dynamicsHir(
      `(tokens) => {
        const n = tokens.length;
        return tokens.map((token) => ({ x: n * token.x }));
      }`,
    );
    expect(classifyDynamics(hir, fields)).toEqual({ kind: "coupled" });
  });
});
