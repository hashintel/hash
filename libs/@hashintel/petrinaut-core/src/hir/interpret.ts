/**
 * Direct evaluation of HIR functions — the execution backend for scenario
 * surfaces.
 *
 * Scenario compilation runs once per run or optimization trial (cold code),
 * so the HIR is interpreted rather than emitted as JavaScript: no
 * `new Function`, no sandbox, and dynamic-length shapes (`range(n).map(...)`)
 * that the buffer emitters cannot unroll evaluate naturally.
 *
 * The tree is pure, non-recursive and loop-free, so evaluation always
 * terminates; `range(...)` is the one unbounded allocation and carries the
 * `MAX_RANGE_LENGTH` ceiling. Records are built without a prototype because
 * their keys are user-authored (see `validation/record-keys.ts`).
 */
import { range } from "../simulation/authoring/scenario/helpers";
import { createUserKeyedRecord, getOwn } from "../validation/record-keys";

import type { HirExpr, HirFunction, Span } from "./hir";

export type HirValue =
  | number
  | boolean
  | string
  | HirValue[]
  | { [key: string]: HirValue };

/** Ambient values for `parameters.<name>` and `scenario.<name>` reads. */
export type HirInterpretBindings = {
  parameters: Readonly<Record<string, number | boolean>>;
  scenario: Readonly<Record<string, number | boolean>>;
};

/** Evaluation failure, positioned in the user-visible source text. */
export class HirInterpretError extends Error {
  readonly span: Span;

  constructor(message: string, span: Span) {
    super(message);
    this.name = "HirInterpretError";
    this.span = span;
  }
}

type Env = Map<string, HirValue>;

const CONSTANT_VALUES = {
  PI: Math.PI,
  E: Math.E,
  Infinity,
  NaN,
} as const;

function truthy(value: HirValue): boolean {
  return Boolean(value);
}

function asNumber(value: HirValue, span: Span, what: string): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  throw new HirInterpretError(`${what} must be a number.`, span);
}

function evalExpr(
  expr: HirExpr,
  env: Env,
  bindings: HirInterpretBindings,
): HirValue {
  switch (expr.kind) {
    case "numberLit":
      return expr.value;
    case "boolLit":
      return expr.value;
    case "stringLit":
      return expr.value;
    case "constant":
      return CONSTANT_VALUES[expr.name];
    case "localRef": {
      const value = env.get(expr.name);
      if (value === undefined) {
        throw new HirInterpretError(
          `Unknown identifier \`${expr.name}\`.`,
          expr.span,
        );
      }
      return value;
    }
    case "paramRef": {
      const value = getOwn(bindings.parameters, expr.name);
      if (value === undefined) {
        throw new HirInterpretError(
          `Unknown parameter \`${expr.name}\`.`,
          expr.span,
        );
      }
      return value;
    }
    case "scenarioRef": {
      const value = getOwn(bindings.scenario, expr.name);
      if (value === undefined) {
        throw new HirInterpretError(
          `Unknown scenario parameter \`${expr.name}\`.`,
          expr.span,
        );
      }
      return value;
    }
    case "fieldAccess": {
      const target = evalExpr(expr.target, env, bindings);
      if (typeof target !== "object" || Array.isArray(target)) {
        throw new HirInterpretError(
          `Cannot access \`${expr.field}\` here.`,
          expr.fieldSpan,
        );
      }
      const value = getOwn(target, expr.field);
      if (value === undefined) {
        throw new HirInterpretError(
          `\`${expr.field}\` does not exist here.`,
          expr.fieldSpan,
        );
      }
      return value;
    }
    case "indexAccess": {
      const target = evalExpr(expr.target, env, bindings);
      if (!Array.isArray(target)) {
        throw new HirInterpretError("Only arrays can be indexed.", expr.span);
      }
      const index = asNumber(
        evalExpr(expr.index, env, bindings),
        expr.index.span,
        "An array index",
      );
      if (!Number.isInteger(index) || index < 0 || index >= target.length) {
        throw new HirInterpretError(
          `Index ${String(index)} is out of bounds — the array has ${target.length} element(s).`,
          expr.span,
        );
      }
      return target[index]!;
    }
    case "length": {
      const target = evalExpr(expr.target, env, bindings);
      if (Array.isArray(target) || typeof target === "string") {
        return target.length;
      }
      throw new HirInterpretError(
        "`.length` is only available on arrays and strings.",
        expr.span,
      );
    }
    case "unary": {
      const operand = evalExpr(expr.operand, env, bindings);
      if (expr.op === "!") {
        return !truthy(operand);
      }
      const value = asNumber(
        operand,
        expr.operand.span,
        `The operand of \`${expr.op}\``,
      );
      return expr.op === "-" ? -value : value;
    }
    case "binary": {
      const left = evalExpr(expr.left, env, bindings);
      // Short-circuiting operators evaluate the right side lazily, with
      // JavaScript's value semantics (they return an operand, not a coerced
      // boolean) — the type checker constrains both sides to booleans.
      if (expr.op === "&&") {
        return truthy(left) ? evalExpr(expr.right, env, bindings) : left;
      }
      if (expr.op === "||") {
        return truthy(left) ? left : evalExpr(expr.right, env, bindings);
      }
      const right = evalExpr(expr.right, env, bindings);
      if (expr.op === "==") {
        return left === right;
      }
      if (expr.op === "!=") {
        return left !== right;
      }
      const leftNumber = asNumber(
        left,
        expr.left.span,
        `\`${expr.op}\` operands`,
      );
      const rightNumber = asNumber(
        right,
        expr.right.span,
        `\`${expr.op}\` operands`,
      );
      switch (expr.op) {
        case "+":
          return leftNumber + rightNumber;
        case "-":
          return leftNumber - rightNumber;
        case "*":
          return leftNumber * rightNumber;
        case "/":
          return leftNumber / rightNumber;
        case "%":
          return leftNumber % rightNumber;
        case "**":
          return leftNumber ** rightNumber;
        case "<":
          return leftNumber < rightNumber;
        case "<=":
          return leftNumber <= rightNumber;
        case ">":
          return leftNumber > rightNumber;
        case ">=":
          return leftNumber >= rightNumber;
      }
    }
    case "cond":
      return truthy(evalExpr(expr.condition, env, bindings))
        ? evalExpr(expr.thenBranch, env, bindings)
        : evalExpr(expr.elseBranch, env, bindings);
    case "let": {
      const scoped = new Map(env);
      for (const binding of expr.bindings) {
        scoped.set(binding.name, evalExpr(binding.value, scoped, bindings));
      }
      return evalExpr(expr.body, scoped, bindings);
    }
    case "mathCall": {
      const args = expr.args.map((argument) =>
        asNumber(
          evalExpr(argument, env, bindings),
          argument.span,
          `\`Math.${expr.fn}\` arguments`,
        ),
      );
      // Every HIR math builtin is variadic-compatible at runtime; the
      // per-function arity is enforced by the type checker.
      return (Math[expr.fn] as (...values: number[]) => number)(...args);
    }
    case "rangeCall": {
      const args = expr.args.map((argument) =>
        asNumber(
          evalExpr(argument, env, bindings),
          argument.span,
          "`range(...)` arguments",
        ),
      );
      try {
        return range(args[0]!, args[1], args[2]);
      } catch (error) {
        throw new HirInterpretError(
          error instanceof Error ? error.message : String(error),
          expr.span,
        );
      }
    }
    case "recordLit": {
      const record = createUserKeyedRecord<HirValue>();
      for (const entry of expr.entries) {
        // `defineProperty` rather than assignment: the record has no
        // prototype (see `createUserKeyedRecord`), so assignment would
        // behave identically for any key, `__proto__` included, and
        // `defineProperty` is the form scanners recognise as safe for
        // user-controlled keys.
        Object.defineProperty(record, entry.key, {
          value: evalExpr(entry.value, env, bindings),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return record;
    }
    case "arrayLit":
      return expr.elements.map((element) => evalExpr(element, env, bindings));
    case "arrayMap": {
      const target = evalExpr(expr.target, env, bindings);
      if (!Array.isArray(target)) {
        throw new HirInterpretError(
          "`.map(...)` is only available on arrays.",
          expr.target.span,
        );
      }
      return target.map((element, index) => {
        const scoped = new Map(env);
        scoped.set(expr.param.name, element);
        if (expr.indexParam) {
          scoped.set(expr.indexParam.name, index);
        }
        return evalExpr(expr.body, scoped, bindings);
      });
    }
    case "arrayReduce": {
      const target = evalExpr(expr.target, env, bindings);
      if (!Array.isArray(target)) {
        throw new HirInterpretError(
          "`.reduce(...)` is only available on arrays.",
          expr.target.span,
        );
      }
      let accumulator = evalExpr(expr.initial, env, bindings);
      for (const [index, element] of target.entries()) {
        const scoped = new Map(env);
        scoped.set(expr.accParam.name, accumulator);
        scoped.set(expr.param.name, element);
        if (expr.indexParam) {
          scoped.set(expr.indexParam.name, index);
        }
        accumulator = evalExpr(expr.body, scoped, bindings);
      }
      return accumulator;
    }
    case "arrayConcat": {
      const left = evalExpr(expr.left, env, bindings);
      const right = evalExpr(expr.right, env, bindings);
      if (!Array.isArray(left) || !Array.isArray(right)) {
        throw new HirInterpretError(
          "`.concat(...)` is only available on arrays.",
          expr.span,
        );
      }
      return [...left, ...right];
    }
    case "stringCall": {
      const target = evalExpr(expr.target, env, bindings);
      const argument = evalExpr(expr.argument, env, bindings);
      if (typeof target !== "string" || typeof argument !== "string") {
        throw new HirInterpretError(
          `\`.${expr.fn}(...)\` is only available on strings.`,
          expr.span,
        );
      }
      return target[expr.fn](argument);
    }
    case "uuidGenerate":
    case "uuidFrom":
    case "distribution":
    case "distributionMap":
      throw new HirInterpretError(
        "Distributions and UUID helpers are not available in scenario code.",
        expr.span,
      );
  }
}

/**
 * Evaluates a lowered (and, at the caller's responsibility, type-checked)
 * HIR function with the given ambient bindings. Scenario functions declare
 * no parameters — `parameters` and `scenario` reads resolve through
 * `bindings`. Surfaces with declared parameters (status conditions bind the
 * token as `token`) pass them through `locals`. Throws `HirInterpretError`
 * (positioned in the user source) on evaluation failure.
 */
export function interpretHir(
  fn: HirFunction,
  bindings: HirInterpretBindings,
  locals?: ReadonlyMap<string, HirValue>,
): HirValue {
  return evalExpr(fn.body, new Map(locals), bindings);
}
