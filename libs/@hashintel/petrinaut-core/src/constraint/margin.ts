/**
 * The signed margin of a constraint: how far its condition holds or fails at
 * one point of the parameter space. `margin >= 0` means satisfied, and every
 * consumer reads the sign that way; a sampler that wants the opposite
 * convention negates through `marginForOptuna`, in one place.
 */
import {
  HirInterpretError,
  type HirInterpretBindings,
  interpretHirExpr,
  type HirValue,
} from "../hir/interpret";

import type { HirBinaryOp, HirExpr, HirFunction, Span } from "../hir/hir";
import type { ParameterConstraint } from "./constraint";

/** Negated exactly once, here, for a sampler that reads `<= 0` as feasible. Unused until a margin reaches Optuna. */
export const marginForOptuna = (margin: number): number => -margin;

export type ParameterConstraintResult = {
  constraintId: string;
  margin: number;
};

/**
 * A strict comparison at exact equality has zero slack yet fails, so its
 * margin cannot be the slack: the sign carries the verdict, so it is the
 * smallest negative number instead.
 */
const BOUNDARY_FAILURE = -Number.MIN_VALUE;

type Locals = ReadonlyMap<string, HirValue>;

const COMPARISONS = new Set<HirBinaryOp>(["<", "<=", ">", ">=", "==", "!="]);

const truthy = (value: HirValue): boolean => Boolean(value);

const numeric = (value: HirValue, span: Span, what: string): number => {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  throw new HirInterpretError(`${what} must be a number.`, span);
};

/** The verdict of `left <op> right` under the interpreter's own rules. */
const comparisonHolds = (
  op: HirBinaryOp,
  left: HirValue,
  right: HirValue,
  leftSpan: Span,
  rightSpan: Span,
): boolean => {
  if (op === "==") {
    return left === right;
  }
  if (op === "!=") {
    return left !== right;
  }
  const leftNumber = numeric(left, leftSpan, `\`${op}\` operands`);
  const rightNumber = numeric(right, rightSpan, `\`${op}\` operands`);
  switch (op) {
    case "<":
      return leftNumber < rightNumber;
    case "<=":
      return leftNumber <= rightNumber;
    case ">":
      return leftNumber > rightNumber;
    default:
      return leftNumber >= rightNumber;
  }
};

/**
 * The slack of a comparison: for `a <= b` and `a < b` it is `b - a`, for
 * `a >= b` and `a > b` it is `a - b`, `==` gives `-|a - b|` and `!=` gives
 * `|a - b|`. Operands that are not numbers (two booleans compared with `==`)
 * have no distance, so their slack is one unit either way.
 */
const comparisonSlack = (
  op: HirBinaryOp,
  left: HirValue,
  right: HirValue,
  holds: boolean,
): number => {
  if (typeof left !== "number" || typeof right !== "number") {
    if (typeof left === "boolean" && typeof right === "boolean") {
      const distance = Math.abs(Number(left) - Number(right));
      return op === "!=" ? distance : -distance;
    }
    return holds ? 1 : -1;
  }
  switch (op) {
    case "<":
    case "<=":
      return right - left;
    case ">":
    case ">=":
      return left - right;
    case "==":
      return -Math.abs(left - right);
    default:
      return Math.abs(left - right);
  }
};

const marginOf = (
  expr: HirExpr,
  locals: Locals,
  bindings: HirInterpretBindings,
): number => {
  switch (expr.kind) {
    case "boolLit":
      return expr.value ? 1 : -1;
    case "unary":
      if (expr.op === "!") {
        return -marginOf(expr.operand, locals, bindings);
      }
      break;
    case "binary": {
      if (expr.op === "&&") {
        return Math.min(
          marginOf(expr.left, locals, bindings),
          marginOf(expr.right, locals, bindings),
        );
      }
      if (expr.op === "||") {
        return Math.max(
          marginOf(expr.left, locals, bindings),
          marginOf(expr.right, locals, bindings),
        );
      }
      if (!COMPARISONS.has(expr.op)) {
        break;
      }
      const left = interpretHirExpr(expr.left, locals, bindings);
      const right = interpretHirExpr(expr.right, locals, bindings);
      const holds = comparisonHolds(
        expr.op,
        left,
        right,
        expr.left.span,
        expr.right.span,
      );
      // `+ 0` folds a `-0` slack (an `==` that holds exactly) into `0`.
      const slack = comparisonSlack(expr.op, left, right, holds) + 0;
      if (holds) {
        return Math.max(slack, 0);
      }
      return slack < 0 ? slack : BOUNDARY_FAILURE;
    }
    case "cond":
      return truthy(interpretHirExpr(expr.condition, locals, bindings))
        ? marginOf(expr.thenBranch, locals, bindings)
        : marginOf(expr.elseBranch, locals, bindings);
    case "let": {
      const scoped = new Map(locals);
      for (const binding of expr.bindings) {
        scoped.set(
          binding.name,
          interpretHirExpr(binding.value, scoped, bindings),
        );
      }
      return marginOf(expr.body, scoped, bindings);
    }
    default:
      break;
  }
  // A bare boolean (a reference, a call, a field) has no boundary to
  // measure: one unit on the side the verdict falls.
  return truthy(interpretHirExpr(expr, locals, bindings)) ? 1 : -1;
};

/**
 * The signed slack of a boolean HIR function at `bindings`: comparisons give
 * their slack, `&&` the minimum of its sides, `||` the maximum, `!` flips
 * the sign, a `cond` takes its chosen branch, a `let` scopes its bindings,
 * and a bare boolean is +1 or -1. `margin >= 0` exactly when the condition
 * holds. Throws `HirInterpretError` where interpretation would.
 */
export const constraintMargin = (
  fn: HirFunction,
  bindings: HirInterpretBindings,
): number => marginOf(fn.body, new Map(), bindings);

/** Every parameter constraint's margin at one point, in the list's order. */
export const evaluateParameterConstraints = (
  constraints: readonly ParameterConstraint[],
  bindings: HirInterpretBindings,
): ParameterConstraintResult[] =>
  constraints.map((constraint) => ({
    constraintId: constraint.id,
    margin: constraintMargin(constraint.hir, bindings),
  }));
