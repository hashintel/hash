import { describe, expect, it } from "vitest";

import { parseExpression } from "./expr";
import {
  createHitAndRun,
  createRng,
  estimateFeasibleFraction,
  planConjuncts,
  sampleByConstruction,
  sampleRejection,
  sampleSoftLearning,
  sampleUniform,
  satisfies,
} from "./sampling";

import type { ParameterSpec } from "./sampling";

const UNIT_SQUARE: ParameterSpec[] = [
  { name: "x", min: 0, max: 1 },
  { name: "y", min: 0, max: 1 },
];

describe("createRng", () => {
  it("is deterministic and in [0, 1)", () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let index = 0; index < 100; index += 1) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("estimateFeasibleFraction", () => {
  it("estimates the half-square within a few percent", () => {
    const fraction = estimateFeasibleFraction(
      UNIT_SQUARE,
      parseExpression("x + y <= 1"),
      4000,
      createRng(1),
    );
    expect(Math.abs(fraction - 0.5)).toBeLessThan(0.05);
  });
});

describe("planConjuncts", () => {
  const parameters: ParameterSpec[] = [
    { name: "a", min: 0, max: 10 },
    { name: "b", min: 0, max: 10 },
    { name: "c", min: 0, max: 10 },
  ];

  it("routes each conjunct to its mechanism", () => {
    const plan = planConjuncts(
      parseExpression("a <= 4 && a <= b && a + 2 * c <= 9 && a * b <= 5"),
      parameters,
    );
    expect(plan.map((conjunct) => conjunct.kind)).toEqual([
      "bound",
      "ordering",
      "linear",
      "nonlinear",
    ]);
    const bound = plan[0]!;
    expect(bound.kind === "bound" && bound.max).toBe(4);
    const ordering = plan[1]!;
    expect(ordering.kind === "ordering" && ordering.lower).toBe("a");
    expect(ordering.kind === "ordering" && ordering.upper).toBe("b");
    const linear = plan[2]!;
    expect(linear.kind === "linear" && linear.bound).toBe(9);
    expect(linear.kind === "linear" && linear.coefficients.get("c")).toBe(2);
  });
});

describe("samplers", () => {
  const constraint = parseExpression("x + y <= 0.5 && x <= y");
  const count = 300;

  it("rejection returns only feasible points and reports its overhead", () => {
    const result = sampleRejection(
      UNIT_SQUARE,
      constraint,
      count,
      createRng(3),
    );
    expect(result.points).toHaveLength(count);
    expect(result.infeasible).toBe(0);
    // Feasible fraction is 1/16, so raw draws should be roughly 16 per point.
    expect(result.attempts).toBeGreaterThan(count * 8);
    expect(result.points.every((point) => satisfies(constraint, point))).toBe(
      true,
    );
  });

  it("uniform leaks proportionally to the infeasible volume", () => {
    const result = sampleUniform(UNIT_SQUARE, constraint, count, createRng(4));
    expect(result.infeasible / count).toBeGreaterThan(0.8);
  });

  it("soft learning leaks less than uniform but is not clean", () => {
    const soft = sampleSoftLearning(
      UNIT_SQUARE,
      constraint,
      count,
      createRng(5),
    );
    const uniform = sampleUniform(UNIT_SQUARE, constraint, count, createRng(5));
    expect(soft.infeasible).toBeLessThan(uniform.infeasible);
    expect(soft.infeasible).toBeGreaterThan(0);
  });

  it("construction honours bounds, orderings, and the polytope", () => {
    const parameters: ParameterSpec[] = [
      { name: "a", min: 0, max: 10 },
      { name: "b", min: 0, max: 10 },
      { name: "c", min: 0, max: 10 },
      { name: "d", min: 0, max: 10 },
    ];
    const expression = parseExpression(
      "a <= 4 && a <= b && c + d <= 8 && c <= 6",
    );
    const plan = planConjuncts(expression, parameters);
    const result = sampleByConstruction(parameters, plan, count, createRng(6));
    expect(result.points).toHaveLength(count);
    expect(result.attempts).toBe(count);
    expect(result.points.every((point) => satisfies(expression, point))).toBe(
      true,
    );
  });

  it("construction rejects only on the nonlinear leftovers", () => {
    const parameters: ParameterSpec[] = [
      { name: "a", min: 0, max: 1 },
      { name: "b", min: 0, max: 1 },
    ];
    const expression = parseExpression("a <= b && a * b <= 0.25");
    const plan = planConjuncts(expression, parameters);
    const result = sampleByConstruction(parameters, plan, count, createRng(7));
    expect(result.points.length).toBeGreaterThan(0);
    expect(result.points.every((point) => satisfies(expression, point))).toBe(
      true,
    );
  });
});

describe("createHitAndRun", () => {
  it("stays inside the polytope and moves around", () => {
    const walk = createHitAndRun(
      UNIT_SQUARE,
      [
        {
          coefficients: new Map([
            ["x", 1],
            ["y", 1],
          ]),
          bound: 0.5,
        },
      ],
      createRng(8),
    )!;
    expect(walk).not.toBeNull();
    const seen = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const point = walk();
      expect(point.x! + point.y!).toBeLessThanOrEqual(0.5 + 1e-9);
      seen.add(`${point.x!.toFixed(2)}:${point.y!.toFixed(2)}`);
    }
    expect(seen.size).toBeGreaterThan(50);
  });

  it("returns null when the region is empty", () => {
    const walk = createHitAndRun(
      UNIT_SQUARE,
      [{ coefficients: new Map([["x", 1]]), bound: -1 }],
      createRng(9),
    );
    expect(walk).toBeNull();
  });
});
