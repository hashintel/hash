/**
 * Writes J-Expr JSON while preserving numeric literal spellings.
 *
 * @internal
 */
import { Record } from "effect";

import { isReadonlyArray } from "../internal/array.js";

import type * as Defs from "./schema.js";

/** An SDK expression tree to render. */
type Expression = Defs.ExpressionType;

/** Quotes object keys and joins already-rendered values. */
const compileObject = (
  entries: readonly (readonly [string, string])[],
): string =>
  `{${entries.map(([key, value]) => `${JSON.stringify(key)}:${value}`).join(",")}}`;

/** Joins already-rendered elements into a JSON array. */
const compileArray = (items: readonly string[]): string =>
  `[${items.join(",")}]`;

/** Adds an optional type annotation to a rendered data constructor. */
const compileAnnotated = (
  key: string,
  value: string,
  type: string | undefined,
): string => {
  if (type === undefined) {
    return compileObject([[key, value]]);
  }

  return compileObject([
    [key, value],
    ["#type", JSON.stringify(type)],
  ]);
};

/** Emits numeric source text directly and JSON-encodes other primitive values. */
const compileLiteral = (value: Defs.LiteralType["#literal"]): string => {
  if (value !== null && typeof value === "object") {
    return value.value;
  }

  return JSON.stringify(value);
};

/** Distinguishes a standalone expression from a labeled-argument object. */
const isPositional = (
  argument: Expression | Defs.LabeledArgumentType,
): argument is Expression =>
  typeof argument === "string" ||
  isReadonlyArray(argument) ||
  !Object.keys(argument).every((key) => key.startsWith(":"));

/**
 * Renders an expression tree as compact J-Expr JSON.
 *
 * Numeric literals keep their stored spelling: an integer retains its full precision and an integral float retains its fraction or exponent. `JSON.stringify` would serialize the SDK's tagged numeric objects instead.
 *
 * Validation is separate. Use `JExpr.make` on the tree before compiling it when you need schema checks.
 *
 * @example
 * ```ts
 * import * as JExpr from "./index.js";
 *
 * JExpr.compile(JExpr.list(JExpr.float(1), JExpr.float(2.5)));
 * // => '{"#list":[{"#literal":1.0},{"#literal":2.5}]}'
 * ```
 */
export const compile = (expression: Expression): string => {
  if (typeof expression === "string") {
    return JSON.stringify(expression);
  }

  if (isReadonlyArray(expression)) {
    return compileArray(
      expression.map((argument) => {
        if (isPositional(argument)) {
          return compile(argument);
        }

        return compileObject(
          Record.toEntries(argument).map(([key, value]) => [
            key,
            compile(value),
          ]),
        );
      }),
    );
  }

  if ("#literal" in expression) {
    return compileAnnotated(
      "#literal",
      compileLiteral(expression["#literal"]),
      expression["#type"],
    );
  }

  if ("#struct" in expression) {
    return compileAnnotated(
      "#struct",
      compileObject(
        Record.toEntries(expression["#struct"]).map(([key, value]) => [
          key,
          compile(value),
        ]),
      ),
      expression["#type"],
    );
  }

  if ("#tuple" in expression) {
    return compileAnnotated(
      "#tuple",
      compileArray(expression["#tuple"].map(compile)),
      expression["#type"],
    );
  }

  if ("#list" in expression) {
    return compileAnnotated(
      "#list",
      compileArray(expression["#list"].map(compile)),
      expression["#type"],
    );
  }

  const entries = expression["#dict"];

  if (isReadonlyArray(entries)) {
    return compileAnnotated(
      "#dict",
      compileArray(
        entries.map(([key, value]) =>
          compileArray([compile(key), compile(value)]),
        ),
      ),
      expression["#type"],
    );
  }

  return compileAnnotated(
    "#dict",
    compileObject(
      Record.toEntries(entries).map(([key, value]) => [key, compile(value)]),
    ),
    expression["#type"],
  );
};
