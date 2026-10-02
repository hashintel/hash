/**
 * Parameter-space sampling strategies for the constraint prototypes: given
 * declarative constraints over the searched parameters, how does a sampler
 * actually draw from the safe region? The playground compares four
 * mechanisms side by side — pure rejection, a soft learning sampler, a
 * router that compiles recognisable constraint shapes into feasible-by-
 * construction transforms, and a hit-and-run walk over the linear
 * (polytope) part — because "shape the sampling space" and "prune the bad
 * draws" behave very differently at low feasible fractions.
 *
 * Everything is deterministic under a seed (no `Math.random`): the stories
 * re-sample on every slider move and must be pure renders.
 */

import {
  canonicalMarginExpr,
  conjunctsOf,
  evaluateExpression,
  linearFormOf,
  marginOf,
  parseExpression,
  printExpression,
} from "./expr";

import type { ExprNode } from "./expr";

export type ParameterSpec = {
  name: string;
  min: number;
  max: number;
};

export type SamplePoint = Readonly<Record<string, number>>;

/** Deterministic 48-bit LCG in [0, 1). */
export type Rng = () => number;

const LCG_MODULUS = 281474976710656n; // 2^48

export function createRng(seed: number): Rng {
  let state = BigInt(Math.floor(seed)) % LCG_MODULUS;
  return () => {
    state = (state * 25214903917n + 11n) % LCG_MODULUS;
    return Number(state / 65536n) / 2 ** 32;
  };
}

function toEnv(point: SamplePoint): Map<string, number> {
  return new Map(Object.entries(point));
}

export function satisfies(node: ExprNode, point: SamplePoint): boolean {
  const value = evaluateExpression(node, toEnv(point));
  return value !== false && value !== 0;
}

export function pointMargin(node: ExprNode, point: SamplePoint): number {
  return marginOf(node, toEnv(point));
}

function dot(
  coefficients: ReadonlyMap<string, number>,
  point: SamplePoint,
): number {
  let sum = 0;
  for (const [name, coefficient] of coefficients) {
    sum += coefficient * (point[name] ?? 0);
  }
  return sum;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function uniformPoint(
  parameters: readonly ParameterSpec[],
  rng: Rng,
): SamplePoint {
  const point: Record<string, number> = {};
  for (const parameter of parameters) {
    point[parameter.name] =
      parameter.min + rng() * (parameter.max - parameter.min);
  }
  return point;
}

/** Monte-Carlo estimate of the feasible fraction of the parameter box. */
export function estimateFeasibleFraction(
  parameters: readonly ParameterSpec[],
  constraint: ExprNode,
  samples: number,
  rng: Rng,
): number {
  let feasible = 0;
  for (let index = 0; index < samples; index += 1) {
    if (satisfies(constraint, uniformPoint(parameters, rng))) {
      feasible += 1;
    }
  }
  return feasible / samples;
}

export type SamplingResult = {
  /** The points a run would actually evaluate. */
  points: SamplePoint[];
  /** Raw draws spent producing them (rejection overhead shows up here). */
  attempts: number;
  /** Points among `points` that violate the constraint (soft mode leaks). */
  infeasible: number;
};

/** Baseline: the box itself, constraint ignored. */
export function sampleUniform(
  parameters: readonly ParameterSpec[],
  constraint: ExprNode,
  count: number,
  rng: Rng,
): SamplingResult {
  const points: SamplePoint[] = [];
  for (let index = 0; index < count; index += 1) {
    points.push(uniformPoint(parameters, rng));
  }
  return {
    points,
    attempts: count,
    infeasible: points.filter((point) => !satisfies(constraint, point)).length,
  };
}

/** Reject-and-redraw with a capped total budget. */
export function sampleRejection(
  parameters: readonly ParameterSpec[],
  constraint: ExprNode,
  count: number,
  rng: Rng,
  maxAttempts = count * 200,
): SamplingResult {
  const points: SamplePoint[] = [];
  let attempts = 0;
  while (points.length < count && attempts < maxAttempts) {
    attempts += 1;
    const point = uniformPoint(parameters, rng);
    if (satisfies(constraint, point)) {
      points.push(point);
    }
  }
  return { points, attempts, infeasible: 0 };
}

/**
 * A miniature of what a margin-aware soft sampler (Optuna's
 * `constraints_func` consumers) does over trials: early draws come from the
 * whole box, later draws mix in Gaussian jitter around the most feasible
 * archive points, so density migrates toward the safe region without ever
 * guaranteeing it. Infeasible points still occur — that is the point.
 */
export function sampleSoftLearning(
  parameters: readonly ParameterSpec[],
  constraint: ExprNode,
  count: number,
  rng: Rng,
): SamplingResult {
  const points: SamplePoint[] = [];
  const archive: { point: SamplePoint; margin: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    const explore = index < count * 0.2 || rng() < 0.3 || archive.length === 0;
    let point: SamplePoint;
    if (explore) {
      point = uniformPoint(parameters, rng);
    } else {
      const ranked = [...archive].sort((a, b) => b.margin - a.margin);
      const eliteCount = Math.max(1, Math.floor(ranked.length * 0.3));
      const anchor = ranked[Math.floor(rng() * eliteCount)]!.point;
      const jittered: Record<string, number> = {};
      for (const parameter of parameters) {
        const spread = (parameter.max - parameter.min) * 0.12;
        const jitter = (rng() + rng() + rng() - 1.5) * spread;
        jittered[parameter.name] = clamp(
          anchor[parameter.name]! + jitter,
          parameter.min,
          parameter.max,
        );
      }
      point = jittered;
    }
    archive.push({ point, margin: pointMargin(constraint, point) });
    points.push(point);
  }
  return {
    points,
    attempts: count,
    infeasible: points.filter((point) => !satisfies(constraint, point)).length,
  };
}

// -- Routing: constraint shapes to construction mechanisms -----------------

export type ConjunctPlan =
  | {
      kind: "bound";
      parameter: string;
      /** The folded interval this conjunct tightens the parameter to. */
      min: number;
      max: number;
      source: string;
    }
  | {
      kind: "ordering";
      lower: string;
      upper: string;
      source: string;
    }
  | {
      kind: "linear";
      coefficients: ReadonlyMap<string, number>;
      /** `Σ coefficient · x <= bound`. */
      bound: number;
      source: string;
    }
  | { kind: "nonlinear"; source: string };

/**
 * Classifies each top-level `&&` conjunct of a constraint into the
 * mechanism that can honour it by construction: a single-parameter bound
 * folds into the box, `a <= b` becomes an ordering transform, any other
 * affine comparison joins the polytope, and everything else is nonlinear
 * (rejection territory).
 */
export function planConjuncts(
  constraint: ExprNode,
  parameters: readonly ParameterSpec[],
): ConjunctPlan[] {
  const names = new Set(parameters.map((parameter) => parameter.name));
  return conjunctsOf(constraint).map((conjunct) => {
    const source = printExpression(conjunct);
    const margin = canonicalMarginExpr(conjunct);
    const linear = margin && linearFormOf(margin, names);
    if (!linear) {
      return { kind: "nonlinear", source };
    }
    const entries = [...linear.coefficients].filter(([, value]) => value !== 0);
    if (entries.length === 1) {
      const [name, coefficient] = entries[0]!;
      // coefficient · x + constant >= 0
      const boundary = -linear.constant / coefficient;
      const spec = parameters.find((parameter) => parameter.name === name)!;
      return coefficient > 0
        ? {
            kind: "bound",
            parameter: name,
            min: boundary,
            max: spec.max,
            source,
          }
        : {
            kind: "bound",
            parameter: name,
            min: spec.min,
            max: boundary,
            source,
          };
    }
    if (
      entries.length === 2 &&
      linear.constant === 0 &&
      Math.abs(entries[0]![1] + entries[1]![1]) < 1e-12 &&
      Math.abs(Math.abs(entries[0]![1]) - 1) < 1e-12
    ) {
      const [first, second] = entries as [[string, number], [string, number]];
      const upper = first[1] > 0 ? first[0] : second[0];
      const lower = first[1] > 0 ? second[0] : first[0];
      return { kind: "ordering", lower, upper, source };
    }
    // margin >= 0 is Σ c·x + k >= 0, i.e. Σ (-c)·x <= k.
    return {
      kind: "linear",
      coefficients: new Map(entries.map(([name, value]) => [name, -value])),
      bound: linear.constant,
      source,
    };
  });
}

const parsedCache = new Map<string, ExprNode>();

function parseCache(source: string): ExprNode {
  const cached = parsedCache.get(source);
  if (cached) {
    return cached;
  }
  const node = parseExpression(source);
  parsedCache.set(source, node);
  return node;
}

type HalfSpace = {
  /** `Σ coefficient · x <= bound`. */
  coefficients: ReadonlyMap<string, number>;
  bound: number;
};

/**
 * Hit-and-run over the polytope `{box ∩ halfspaces}`: from an interior
 * point, pick a random direction, intersect the line with every face, and
 * jump uniformly along the feasible segment. Returns `null` when no
 * interior start is found within budget.
 */
export function createHitAndRun(
  parameters: readonly ParameterSpec[],
  halfSpaces: readonly HalfSpace[],
  rng: Rng,
  burnIn = 32,
): (() => SamplePoint) | null {
  const inside = (point: SamplePoint) =>
    halfSpaces.every(
      ({ coefficients, bound }) => dot(coefficients, point) <= bound + 1e-12,
    );

  let current: Record<string, number> | null = null;
  for (let attempt = 0; attempt < 2000; attempt += 1) {
    const candidate = uniformPoint(parameters, rng) as Record<string, number>;
    if (inside(candidate)) {
      current = candidate;
      break;
    }
  }
  if (!current) {
    return null;
  }

  const step = (): SamplePoint => {
    const direction: Record<string, number> = {};
    let norm = 0;
    for (const parameter of parameters) {
      const gaussian = rng() + rng() + rng() + rng() - 2;
      direction[parameter.name] = gaussian;
      norm += gaussian * gaussian;
    }
    norm = Math.sqrt(norm) || 1;

    // The feasible segment current + t·direction within box and halfspaces.
    let lower = -Infinity;
    let upper = Infinity;
    for (const parameter of parameters) {
      const velocity = direction[parameter.name]! / norm;
      if (Math.abs(velocity) < 1e-15) {
        continue;
      }
      const toMin = (parameter.min - current![parameter.name]!) / velocity;
      const toMax = (parameter.max - current![parameter.name]!) / velocity;
      lower = Math.max(lower, Math.min(toMin, toMax));
      upper = Math.min(upper, Math.max(toMin, toMax));
    }
    for (const { coefficients, bound } of halfSpaces) {
      const position = dot(coefficients, current!);
      let velocity = 0;
      for (const [name, coefficient] of coefficients) {
        velocity += coefficient * (direction[name]! / norm);
      }
      if (Math.abs(velocity) < 1e-15) {
        continue;
      }
      const distance = (bound - position) / velocity;
      if (velocity > 0) {
        upper = Math.min(upper, distance);
      } else {
        lower = Math.max(lower, distance);
      }
    }
    if (!(lower <= upper)) {
      return { ...current! };
    }
    const jump = lower + rng() * (upper - lower);
    for (const parameter of parameters) {
      current![parameter.name] = clamp(
        current![parameter.name]! + (direction[parameter.name]! / norm) * jump,
        parameter.min,
        parameter.max,
      );
    }
    return { ...current! };
  };

  for (let index = 0; index < burnIn; index += 1) {
    step();
  }
  return step;
}

/**
 * Draws every point feasible by construction, per the plan: bounds tighten
 * the box, orderings sample a scaled gap (`upper = lower + t · headroom`),
 * the linear system is walked with hit-and-run, and nonlinear conjuncts
 * fall back to rejection inside the loop. Returns `points` possibly shorter
 * than `count` when the nonlinear leftovers reject too much.
 */
export function sampleByConstruction(
  parameters: readonly ParameterSpec[],
  plan: readonly ConjunctPlan[],
  count: number,
  rng: Rng,
  maxAttempts = count * 200,
): SamplingResult {
  const box = new Map(
    parameters.map((parameter) => [
      parameter.name,
      { min: parameter.min, max: parameter.max },
    ]),
  );
  for (const conjunct of plan) {
    if (conjunct.kind === "bound") {
      const interval = box.get(conjunct.parameter);
      if (interval) {
        interval.min = Math.max(interval.min, conjunct.min);
        interval.max = Math.min(interval.max, conjunct.max);
      }
    }
  }
  const orderings = plan.filter(
    (conjunct): conjunct is ConjunctPlan & { kind: "ordering" } =>
      conjunct.kind === "ordering",
  );
  const linears = plan.filter(
    (conjunct): conjunct is ConjunctPlan & { kind: "linear" } =>
      conjunct.kind === "linear",
  );
  const nonlinears = plan.filter((conjunct) => conjunct.kind === "nonlinear");

  const orderedNames = new Set(
    orderings.flatMap((ordering) => [ordering.lower, ordering.upper]),
  );
  const linearNames = new Set(
    linears.flatMap((linear) => [...linear.coefficients.keys()]),
  );

  // The walk runs over the bound-folded box, so `c <= 6` style conjuncts
  // tighten the polytope's box faces too.
  const foldedParameters = parameters.map((parameter) => {
    const interval = box.get(parameter.name)!;
    return { name: parameter.name, min: interval.min, max: interval.max };
  });
  const walk =
    linears.length > 0
      ? createHitAndRun(
          foldedParameters.filter((parameter) =>
            linearNames.has(parameter.name),
          ),
          linears.map((linear) => ({
            coefficients: linear.coefficients,
            bound: linear.bound,
          })),
          rng,
        )
      : null;
  if (linears.length > 0 && walk === null) {
    // No interior point found: the linear system is (near-)infeasible.
    return { points: [], attempts: 0, infeasible: 0 };
  }

  const points: SamplePoint[] = [];
  let attempts = 0;
  while (points.length < count && attempts < maxAttempts) {
    attempts += 1;
    const point: Record<string, number> = {};
    const walked = walk?.();
    for (const parameter of parameters) {
      if (walked && linearNames.has(parameter.name)) {
        point[parameter.name] = walked[parameter.name]!;
        continue;
      }
      if (orderedNames.has(parameter.name)) {
        continue; // Filled by the ordering pass below.
      }
      const interval = box.get(parameter.name)!;
      if (interval.min > interval.max) {
        return { points, attempts, infeasible: 0 };
      }
      point[parameter.name] =
        interval.min + rng() * (interval.max - interval.min);
    }
    for (const ordering of orderings) {
      const lowerInterval = box.get(ordering.lower)!;
      const upperInterval = box.get(ordering.upper)!;
      const lower =
        point[ordering.lower] ??
        lowerInterval.min + rng() * (lowerInterval.max - lowerInterval.min);
      point[ordering.lower] = lower;
      const floor = Math.max(lower, upperInterval.min);
      if (floor > upperInterval.max) {
        break;
      }
      point[ordering.upper] = floor + rng() * (upperInterval.max - floor);
    }
    if (parameters.some((parameter) => point[parameter.name] === undefined)) {
      continue;
    }
    if (
      nonlinears.length > 0 &&
      !nonlinears.every((conjunct) =>
        satisfies(parseCache(conjunct.source), point),
      )
    ) {
      continue;
    }
    points.push(point);
  }
  return { points, attempts, infeasible: 0 };
}
