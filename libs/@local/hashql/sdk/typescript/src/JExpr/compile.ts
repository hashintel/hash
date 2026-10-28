/**
 * Writes J-Expr JSON while preserving numeric literal spellings.
 *
 * @internal
 */
import { Record } from "effect";

import { isReadonlyArray } from "../internal/array.js";

import type * as Defs from "./schema.js";

type Expression = Defs.ExpressionType;

const compileObject = (
  entries: readonly (readonly [string, string])[],
): string =>
  `{${entries.map(([key, value]) => `${JSON.stringify(key)}:${value}`).join(",")}}`;

const compileArray = (items: readonly string[]): string =>
  `[${items.join(",")}]`;

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

const compileLiteral = (value: Defs.LiteralType["#literal"]): string => {
  if (value !== null && typeof value === "object") {
    return value.value;
  }

  return JSON.stringify(value);
};

/**
 * Tells a labeled argument from an expression by its keys, which all start with `:`, while every data constructor key starts with `#`.
 *
 * HashQL's parser reads only the first key. Both tests agree on every tree that `JExpr.make` accepts.
 */
const isPositional = (
  argument: Expression | Defs.LabeledArgumentType,
): argument is Expression =>
  typeof argument === "string" ||
  isReadonlyArray(argument) ||
  !Object.keys(argument).every((key) => key.startsWith(":"));

/**
 * Writes an expression tree as compact J-Expr JSON text.
 *
 * Each numeric literal keeps its stored text, so an integer keeps every digit and a float keeps its fraction or exponent. `JSON.stringify` would write the SDK's tagged numeric objects instead, which HashQL rejects because a `#literal` value must be a JSON primitive. Strings are JSON-escaped, and object keys follow each object's own enumerable string-key order. A call argument whose keys all start with `:` becomes a labeled argument.
 *
 * Serialization does not validate. A literal that `JExpr.make` would reject keeps its stored text, so the output can contain non-JSON text such as `NaN`. Check a tree from an untrusted source with `JExpr.make` before compiling it.
 *
 * @throws {TypeError} If an object in the tree has no constructor key.
 * @throws {RangeError} If the tree's nesting exhausts the JavaScript call stack.
 *
 * @example <caption>Serialize exact numbers, unlike JSON.stringify.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr } from "@local/hashql";
 *
 * const values = JExpr.tuple(JExpr.integer(2n ** 64n), JExpr.float(1), JExpr.float(2.5));
 * assert.equal(JExpr.compile(values), '{"#tuple":[{"#literal":18446744073709551616},{"#literal":1.0},{"#literal":2.5}]}');
 * assert.equal(JSON.stringify(JExpr.integer(1)), '{"#literal":{"_tag":"Integer","value":"1"}}');
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
