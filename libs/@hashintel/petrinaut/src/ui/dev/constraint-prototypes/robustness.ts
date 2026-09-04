/**
 * Trace-level robustness for the constraint prototypes: how a state
 * constraint's per-step margin collapses over a run, how temporal operators
 * (`always`, `eventually`, `during`, `within`, `until`) reshape that
 * collapse, and how a signed margin becomes the continuous objective
 * multiplier Chris asked for — a smooth factor that is ~1 safely inside the
 * region and drops progressively to 0 outside it.
 *
 * The classic STL robustness semantics are min/max compositions; the smooth
 * variants replace them with a temperature-controlled logsumexp (soft-min /
 * soft-max), following "Smooth Operator" (Pant, Abbas, Mangharam 2017).
 */

import { evaluateExpression, marginOf, parseExpression } from "./expr";

import type { ExprEnv, ExprNode } from "./expr";

/** One recorded run: `steps[t]` is the environment at time index `t`. */
export type Trace = {
  /** Simulated time per step, strictly increasing. */
  times: readonly number[];
  /** Per-step values, keyed like an `ExprEnv` (metric and parameter names). */
  steps: readonly ExprEnv[];
};

export const TEMPORAL_FUNCTIONS = [
  "always",
  "eventually",
  "during",
  "within",
  "until",
  "atEnd",
] as const;

export type TemporalFunction = (typeof TEMPORAL_FUNCTIONS)[number];

function isTemporal(name: string): name is TemporalFunction {
  return (TEMPORAL_FUNCTIONS as readonly string[]).includes(name);
}

/** Whether the expression contains any temporal operator call. */
export function usesTemporalOperators(node: ExprNode): boolean {
  switch (node.kind) {
    case "number":
    case "boolean":
    case "ident":
      return false;
    case "unary":
      return usesTemporalOperators(node.operand);
    case "binary":
      return (
        usesTemporalOperators(node.left) || usesTemporalOperators(node.right)
      );
    case "cond":
      return (
        usesTemporalOperators(node.condition) ||
        usesTemporalOperators(node.whenTrue) ||
        usesTemporalOperators(node.whenFalse)
      );
    case "call":
      return (
        isTemporal(node.name) ||
        node.args.some((argument) => usesTemporalOperators(argument))
      );
  }
}

export type RobustnessOptions = {
  /**
   * Softness temperature for the min/max collapses. `0` (the default) is
   * the exact semantics; a positive value substitutes logsumexp soft-min /
   * soft-max, trading soundness for a gradient everywhere.
   */
  temperature?: number;
};

function logSumExp(values: readonly number[]): number {
  const highest = Math.max(...values);
  if (!Number.isFinite(highest)) {
    return highest;
  }
  const sum = values.reduce(
    (accumulator, value) => accumulator + Math.exp(value - highest),
    0,
  );
  return highest + Math.log(sum);
}

/**
 * Soft minimum: exact `min` at temperature 0, `-T · logsumexp(-v/T)`
 * otherwise — an under-approximation of `min`, so a positive soft value
 * does not certify satisfaction, but it is differentiable everywhere.
 */
export function softMin(
  values: readonly number[],
  temperature: number,
): number {
  if (temperature <= 0) {
    return Math.min(...values);
  }
  return -logSumExp(values.map((value) => -value / temperature)) * temperature;
}

/** Soft maximum: the dual over-approximation of `max`. */
export function softMax(
  values: readonly number[],
  temperature: number,
): number {
  if (temperature <= 0) {
    return Math.max(...values);
  }
  return logSumExp(values.map((value) => value / temperature)) * temperature;
}

function range(from: number, to: number): number[] {
  const values: number[] = [];
  for (let index = from; index <= to; index += 1) {
    values.push(index);
  }
  return values;
}

function collapse(
  values: number[],
  mode: "min" | "max",
  temperature: number,
): number {
  if (values.length === 0) {
    // An empty window: `always` over nothing is vacuously satisfied,
    // `eventually` over nothing cannot be.
    return mode === "min" ? Infinity : -Infinity;
  }
  return mode === "min"
    ? softMin(values, temperature)
    : softMax(values, temperature);
}

function temporalArguments(node: ExprNode & { kind: "call" }): {
  window: { from: number; to: number } | null;
  body: ExprNode;
} {
  if (node.args.length === 1) {
    return { window: null, body: node.args[0]! };
  }
  if (node.args.length === 3) {
    const [from, to, body] = node.args as [ExprNode, ExprNode, ExprNode];
    if (from.kind !== "number" || to.kind !== "number") {
      throw new Error(`${node.name}(t1, t2, expr) needs literal time bounds`);
    }
    return { window: { from: from.value, to: to.value }, body };
  }
  throw new Error(
    `${node.name}(...) takes (expr) or (t1, t2, expr), not ${node.args.length} arguments`,
  );
}

/** Step indices whose time falls inside `start`'s window (relative bounds). */
function stepsInWindow(
  trace: Trace,
  start: number,
  window: { from: number; to: number } | null,
): number[] {
  if (window === null) {
    return range(start, trace.steps.length - 1);
  }
  const origin = trace.times[start]!;
  const steps: number[] = [];
  for (let step = start; step < trace.steps.length; step += 1) {
    const offset = trace.times[step]! - origin;
    if (offset >= window.from && offset <= window.to) {
      steps.push(step);
    }
  }
  return steps;
}

/** Robustness of `node` at step `start`, STL-style. */
function robustnessAt(
  node: ExprNode,
  trace: Trace,
  start: number,
  temperature: number,
): number {
  switch (node.kind) {
    case "unary":
      if (node.op === "!") {
        return -robustnessAt(node.operand, trace, start, temperature);
      }
      return marginOf(node, trace.steps[start]!);
    case "binary":
      if (node.op === "&&") {
        return softMin(
          [
            robustnessAt(node.left, trace, start, temperature),
            robustnessAt(node.right, trace, start, temperature),
          ],
          temperature,
        );
      }
      if (node.op === "||") {
        return softMax(
          [
            robustnessAt(node.left, trace, start, temperature),
            robustnessAt(node.right, trace, start, temperature),
          ],
          temperature,
        );
      }
      return marginOf(node, trace.steps[start]!);
    case "call": {
      if (!isTemporal(node.name)) {
        return marginOf(node, trace.steps[start]!);
      }
      if (node.name === "atEnd") {
        if (node.args.length !== 1) {
          throw new Error("atEnd(expr) takes exactly one condition");
        }
        return robustnessAt(
          node.args[0]!,
          trace,
          trace.steps.length - 1,
          temperature,
        );
      }
      if (node.name === "until") {
        if (node.args.length !== 2) {
          throw new Error("until(a, b) takes exactly two conditions");
        }
        const [hold, release] = node.args as [ExprNode, ExprNode];
        // sup over release points of min(release robustness, held strict
        // prefix) — the hold is not required at the release step itself.
        const candidates: number[] = [];
        for (let step = start; step < trace.steps.length; step += 1) {
          const releaseValue = robustnessAt(release, trace, step, temperature);
          const heldPrefix = collapse(
            range(start, step - 1).map((prefixStep) =>
              robustnessAt(hold, trace, prefixStep, temperature),
            ),
            "min",
            temperature,
          );
          candidates.push(Math.min(releaseValue, heldPrefix));
        }
        return collapse(candidates, "max", temperature);
      }
      const { window, body } = temporalArguments(node);
      const steps = stepsInWindow(trace, start, window);
      const values = steps.map((step) =>
        robustnessAt(body, trace, step, temperature),
      );
      const mode =
        node.name === "always" || node.name === "during" ? "min" : "max";
      return collapse(values, mode, temperature);
    }
    default:
      return marginOf(node, trace.steps[start]!);
  }
}

/**
 * Quantitative robustness of a constraint over one whole trace: `>= 0` iff
 * the trace satisfies it, magnitude measuring how comfortably.
 *
 * A constraint with no temporal operator is treated as an implicit
 * `always(...)` — the invariant reading, matching "stays in the safe space
 * during simulation". Temporal calls take the sub-expression last, with
 * optional leading time bounds:
 *
 * - `always(expr)` / `always(t1, t2, expr)` — min over the (windowed) steps
 * - `eventually(expr)` / `eventually(t1, t2, expr)` — max
 * - `during(t1, t2, expr)` — alias of windowed `always`
 * - `within(t1, t2, expr)` — alias of windowed `eventually`
 * - `until(a, b)` — `a` must hold until `b` does
 * - `atEnd(expr)` — the margin at the final step (the RFC's "in the end")
 */
export function traceRobustness(
  node: ExprNode,
  trace: Trace,
  options: RobustnessOptions = {},
): number {
  if (!usesTemporalOperators(node)) {
    return collapse(
      trace.steps.map((step) => marginOf(node, step)),
      "min",
      options.temperature ?? 0,
    );
  }
  return robustnessAt(node, trace, 0, options.temperature ?? 0);
}

export const PENALTY_KINDS = ["exponential", "logistic", "hard"] as const;

export type PenaltyKind = (typeof PENALTY_KINDS)[number];

/**
 * The objective multiplier a margin produces: ~1 while safely inside the
 * region, dropping continuously to 0 as the violation deepens. `width` is
 * the tolerance band in the margin's own units — the "how far out is fully
 * bad" scale.
 *
 * - `exponential` — 1 inside, `exp(margin / width)` outside: exactly 1 for
 *   any satisfied margin, smooth decay past the boundary.
 * - `logistic` — `1 / (1 + exp(-4 · margin / width))`: symmetric S-curve
 *   that already discounts near-boundary satisfaction (a graded preference
 *   for staying clear of the edge).
 * - `hard` — the step function, for contrast with what pruning would do.
 */
export function penaltyMultiplier(
  margin: number,
  width: number,
  kind: PenaltyKind,
): number {
  const scale = Math.max(width, 1e-9);
  switch (kind) {
    case "exponential":
      return margin >= 0 ? 1 : Math.exp(margin / scale);
    case "logistic":
      return 1 / (1 + Math.exp((-4 * margin) / scale));
    case "hard":
      return margin >= 0 ? 1 : 0;
  }
}

/** Convenience: parse once, robustness per call. Throws `ExprError`. */
export function compileConstraint(source: string): {
  node: ExprNode;
  robustness: (trace: Trace, options?: RobustnessOptions) => number;
  marginAtStep: (env: ExprEnv) => number;
} {
  const node = parseExpression(source);
  return {
    node,
    robustness: (trace, options) => traceRobustness(node, trace, options),
    marginAtStep: (env) => marginOf(node, env),
  };
}

/** Per-step margins for plotting a constraint against a trace. */
export function stepMargins(node: ExprNode, trace: Trace): number[] {
  return trace.steps.map((step) => marginOf(node, step));
}

/** Per-step raw values of a numeric expression, for plotting. */
export function stepValues(node: ExprNode, trace: Trace): number[] {
  return trace.steps.map((step) => {
    const value = evaluateExpression(node, step);
    return typeof value === "number" ? value : value ? 1 : 0;
  });
}
