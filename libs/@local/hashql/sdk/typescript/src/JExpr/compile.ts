/**
 * Writes J-Expr JSON while preserving numeric literal spellings.
 *
 * @internal
 */
import { Record } from "effect";

import { isReadonlyArray } from "../internal/array.js";
import { printer, separated } from "../internal/printer.js";

import type * as Defs from "./schema.js";

type Expression = Defs.ExpressionType;

/** An expression to write in place of the step. */
interface Node {
  readonly _tag: "Expression";
  readonly expression: Expression;
}

type Step = string | Node;

const node = (expression: Expression): readonly Step[] => [
  { _tag: "Expression", expression },
];

const objectSteps = (
  entries: readonly (readonly [string, Expression])[],
): readonly Step[] => [
  "{",
  ...separated(entries, ",", ([key, value]) => [
    `${JSON.stringify(key)}:`,
    ...node(value),
  ]),
  "}",
];

const arraySteps = <A>(
  items: readonly A[],
  steps: (item: A) => readonly Step[],
): readonly Step[] => ["[", ...separated(items, ",", steps), "]"];

const annotatedSteps = (
  key: string,
  body: readonly Step[],
  type: string | undefined,
): readonly Step[] => {
  const open = `{${JSON.stringify(key)}:`;
  if (type === undefined) {
    return [open, ...body, "}"];
  }

  return [
    open,
    ...body,
    `,${JSON.stringify("#type")}:${JSON.stringify(type)}}`,
  ];
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

const print = printer(({ expression }: Node): readonly Step[] => {
  if (typeof expression === "string") {
    return [JSON.stringify(expression)];
  }

  if (isReadonlyArray(expression)) {
    return arraySteps(expression, (argument) => {
      if (isPositional(argument)) {
        return node(argument);
      }

      return objectSteps(Record.toEntries(argument));
    });
  }

  if ("#literal" in expression) {
    return annotatedSteps(
      "#literal",
      [compileLiteral(expression["#literal"])],
      expression["#type"],
    );
  }

  if ("#struct" in expression) {
    return annotatedSteps(
      "#struct",
      objectSteps(Record.toEntries(expression["#struct"])),
      expression["#type"],
    );
  }

  if ("#tuple" in expression) {
    return annotatedSteps(
      "#tuple",
      arraySteps(expression["#tuple"], node),
      expression["#type"],
    );
  }

  if ("#list" in expression) {
    return annotatedSteps(
      "#list",
      arraySteps(expression["#list"], node),
      expression["#type"],
    );
  }

  const entries = expression["#dict"];

  if (isReadonlyArray(entries)) {
    return annotatedSteps(
      "#dict",
      arraySteps(entries, ([key, value]) => arraySteps([key, value], node)),
      expression["#type"],
    );
  }

  return annotatedSteps(
    "#dict",
    objectSteps(Record.toEntries(entries)),
    expression["#type"],
  );
});

/**
 * Writes an expression tree as compact J-Expr JSON text.
 *
 * Each numeric literal keeps its stored text, so an integer keeps every digit and a float keeps its fraction or exponent. `JSON.stringify` would write the SDK's tagged numeric objects instead, which HashQL rejects because a `#literal` value must be a JSON primitive. Strings are JSON-escaped, and object keys follow each object's own enumerable string-key order. A call argument whose keys all start with `:` becomes a labeled argument.
 *
 * Serialization does not validate. A literal that `JExpr.make` would reject keeps its stored text, so the output can contain non-JSON text such as `NaN`. Check a tree from an untrusted source with `JExpr.make` before compiling it.
 *
 * @throws {TypeError} If an object in the tree has no constructor key.
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
export const compile = (expression: Expression): string =>
  print(node(expression));
