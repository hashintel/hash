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
 *
 * The view HIR evaluates a visualizer's expressions through
 * `interpretHirExpr` with the visualizer's rules, so no JavaScript from the
 * net ever runs there either.
 */
import { range } from "../simulation/authoring/scenario/helpers";
import { createUserKeyedRecord, getOwn } from "../validation/record-keys";

import type { HirExpr, HirFunction, Span } from "./hir";

export type HirValue =
  | number
  | boolean
  | string
  | bigint
  | null
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

type Env = ReadonlyMap<string, HirValue>;

/**
 * How an index past the end reads. Scenario code treats it as the bug it
 * is; a visualizer keeps JavaScript's `undefined`, surfaced as `null`, so
 * `tokens[0] || fallback` draws an empty place.
 */
export type HirInterpretOptions = {
  outOfRangeIndex?: "error" | "null";
};

type Evaluation = {
  bindings: HirInterpretBindings;
  outOfRangeIndex: "error" | "null";
};

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

/** Text for an interpolated or concatenated value, as JavaScript writes it. */
function asText(value: HirValue, span: Span): string {
  switch (typeof value) {
    case "string":
      return value;
    case "number":
    case "boolean":
    case "bigint":
      return String(value);
    default:
      if (value === null) {
        return "null";
      }
      throw new HirInterpretError(
        "Only numbers, strings and booleans can be written as text.",
        span,
      );
  }
}

function isRecord(value: HirValue): value is { [key: string]: HirValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function evalExpr(expr: HirExpr, env: Env, evaluation: Evaluation): HirValue {
  const { bindings } = evaluation;
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
      const target = evalExpr(expr.target, env, evaluation);
      if (!isRecord(target)) {
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
      const target = evalExpr(expr.target, env, evaluation);
      if (!Array.isArray(target)) {
        throw new HirInterpretError("Only arrays can be indexed.", expr.span);
      }
      const index = asNumber(
        evalExpr(expr.index, env, evaluation),
        expr.index.span,
        "An array index",
      );
      if (!Number.isInteger(index) || index < 0 || index >= target.length) {
        if (evaluation.outOfRangeIndex === "null") {
          return null;
        }
        throw new HirInterpretError(
          `Index ${String(index)} is out of bounds — the array has ${target.length} element(s).`,
          expr.span,
        );
      }
      return target[index]!;
    }
    case "length": {
      const target = evalExpr(expr.target, env, evaluation);
      if (Array.isArray(target) || typeof target === "string") {
        return target.length;
      }
      throw new HirInterpretError(
        "`.length` is only available on arrays and strings.",
        expr.span,
      );
    }
    case "unary": {
      const operand = evalExpr(expr.operand, env, evaluation);
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
      const left = evalExpr(expr.left, env, evaluation);
      // Short-circuiting operators evaluate the right side lazily, with
      // JavaScript's value semantics (they return an operand, not a coerced
      // boolean) — the type checker constrains both sides to booleans.
      if (expr.op === "&&") {
        return truthy(left) ? evalExpr(expr.right, env, evaluation) : left;
      }
      if (expr.op === "||") {
        return truthy(left) ? left : evalExpr(expr.right, env, evaluation);
      }
      const right = evalExpr(expr.right, env, evaluation);
      if (expr.op === "==") {
        return left === right;
      }
      if (expr.op === "!=") {
        return left !== right;
      }
      // String concatenation, as JavaScript's `+` does when either side is
      // a string. The type checker admits it on the visualizer surface only.
      if (
        expr.op === "+" &&
        (typeof left === "string" || typeof right === "string")
      ) {
        return asText(left, expr.left.span) + asText(right, expr.right.span);
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
      return truthy(evalExpr(expr.condition, env, evaluation))
        ? evalExpr(expr.thenBranch, env, evaluation)
        : evalExpr(expr.elseBranch, env, evaluation);
    case "let": {
      const scoped = new Map(env);
      for (const binding of expr.bindings) {
        scoped.set(binding.name, evalExpr(binding.value, scoped, evaluation));
      }
      return evalExpr(expr.body, scoped, evaluation);
    }
    case "mathCall": {
      const args = expr.args.map((argument) =>
        asNumber(
          evalExpr(argument, env, evaluation),
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
          evalExpr(argument, env, evaluation),
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
          value: evalExpr(entry.value, env, evaluation),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return record;
    }
    case "arrayLit":
      return expr.elements.map((element) => evalExpr(element, env, evaluation));
    case "arrayMap": {
      const target = evalExpr(expr.target, env, evaluation);
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
        return evalExpr(expr.body, scoped, evaluation);
      });
    }
    case "arrayReduce": {
      const target = evalExpr(expr.target, env, evaluation);
      if (!Array.isArray(target)) {
        throw new HirInterpretError(
          "`.reduce(...)` is only available on arrays.",
          expr.target.span,
        );
      }
      let accumulator = evalExpr(expr.initial, env, evaluation);
      for (const [index, element] of target.entries()) {
        const scoped = new Map(env);
        scoped.set(expr.accParam.name, accumulator);
        scoped.set(expr.param.name, element);
        if (expr.indexParam) {
          scoped.set(expr.indexParam.name, index);
        }
        accumulator = evalExpr(expr.body, scoped, evaluation);
      }
      return accumulator;
    }
    case "arrayConcat": {
      const left = evalExpr(expr.left, env, evaluation);
      const right = evalExpr(expr.right, env, evaluation);
      if (!Array.isArray(left) || !Array.isArray(right)) {
        throw new HirInterpretError(
          "`.concat(...)` is only available on arrays.",
          expr.span,
        );
      }
      return [...left, ...right];
    }
    case "stringCall": {
      const target = evalExpr(expr.target, env, evaluation);
      const argument = evalExpr(expr.argument, env, evaluation);
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
    case "nullLit":
      return null;
    case "templateLit": {
      let text = expr.quasis[0] ?? "";
      for (const [index, expression] of expr.expressions.entries()) {
        text +=
          asText(evalExpr(expression, env, evaluation), expression.span) +
          (expr.quasis[index + 1] ?? "");
      }
      return text;
    }
    case "arraySlice": {
      const target = evalExpr(expr.target, env, evaluation);
      if (!Array.isArray(target)) {
        throw new HirInterpretError(
          "`.slice(...)` is only available on arrays.",
          expr.target.span,
        );
      }
      const bound = (argument: HirExpr | undefined): number | undefined =>
        argument === undefined
          ? undefined
          : asNumber(
              evalExpr(argument, env, evaluation),
              argument.span,
              "`.slice(...)` arguments",
            );
      return target.slice(bound(expr.start), bound(expr.end));
    }
    case "arrayFilter": {
      const target = evalExpr(expr.target, env, evaluation);
      if (!Array.isArray(target)) {
        throw new HirInterpretError(
          "`.filter(...)` is only available on arrays.",
          expr.target.span,
        );
      }
      return target.filter((element, index) => {
        const scoped = new Map(env);
        scoped.set(expr.param.name, element);
        if (expr.indexParam) {
          scoped.set(expr.indexParam.name, index);
        }
        return truthy(evalExpr(expr.body, scoped, evaluation));
      });
    }
    case "numberFormat": {
      const target = asNumber(
        evalExpr(expr.target, env, evaluation),
        expr.target.span,
        "`.toFixed(...)` target",
      );
      const digits =
        expr.digits === undefined
          ? 0
          : asNumber(
              evalExpr(expr.digits, env, evaluation),
              expr.digits.span,
              "`.toFixed(...)` digits",
            );
      if (!Number.isInteger(digits) || digits < 0 || digits > 100) {
        throw new HirInterpretError(
          "`.toFixed(...)` takes a whole number of digits between 0 and 100.",
          expr.digits?.span ?? expr.span,
        );
      }
      return target.toFixed(digits);
    }
  }
}

/**
 * Evaluates one expression under `locals` (the enclosing `let` and callback
 * bindings) and the ambient bindings. Analyses that walk the tree themselves,
 * such as a constraint's margin or the view HIR's interpreter, evaluate
 * their operands through this.
 */
export function interpretHirExpr(
  expr: HirExpr,
  locals: ReadonlyMap<string, HirValue>,
  bindings: HirInterpretBindings,
  options: HirInterpretOptions = {},
): HirValue {
  return evalExpr(expr, locals, {
    bindings,
    outOfRangeIndex: options.outOfRangeIndex ?? "error",
  });
}

/**
 * Evaluates a lowered (and, at the caller's responsibility, type-checked)
 * HIR function with the given ambient bindings. Scenario functions declare
 * no parameters — `parameters` and `scenario` reads resolve through
 * `bindings`. Throws `HirInterpretError` (positioned in the user source) on
 * evaluation failure.
 */
export function interpretHir(
  fn: HirFunction,
  bindings: HirInterpretBindings,
): HirValue {
  return evalExpr(fn.body, new Map(), { bindings, outOfRangeIndex: "error" });
}
