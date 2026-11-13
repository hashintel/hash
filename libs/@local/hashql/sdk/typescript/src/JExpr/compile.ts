/**
 * Writes J-Expr JSON while preserving numeric literal spellings.
 *
 * @internal
 */
import { Record, Result, Schema, SchemaIssue, SchemaParser } from "effect";

import { isReadonlyArray } from "../internal/array.js";
import { separated, tryPrinter } from "../internal/printer.js";
import * as Defs from "./schema.js";

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

type Literal = Defs.LiteralType["#literal"];

/** Writes a literal's text, or fails on a literal it refuses to write. */
type LiteralWriter = (
  value: Literal,
) => Result.Result<string, SchemaIssue.Issue>;

const uncheckedLiteral: LiteralWriter = (value) => {
  if (value !== null && typeof value === "object") {
    return Result.succeed(value.value);
  }

  return Result.succeed(JSON.stringify(value));
};

const numericLiteral = SchemaParser.decodeResult(
  Schema.toType(Schema.Union([Defs.Integer, Defs.Float])),
);

// The schema's own spelling checks decide, so the written text is exactly what `JExpr.make` would accept.
const checkedLiteral: LiteralWriter = (value) => {
  if (value !== null && typeof value === "object") {
    return Result.map(numericLiteral(value), (number) => number.value);
  }

  return uncheckedLiteral(value);
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

const expand =
  (literal: LiteralWriter) =>
  ({ expression }: Node): Result.Result<readonly Step[], SchemaIssue.Issue> => {
    if (typeof expression === "string") {
      return Result.succeed([JSON.stringify(expression)]);
    }

    if (isReadonlyArray(expression)) {
      return Result.succeed(
        arraySteps(expression, (argument) => {
          if (isPositional(argument)) {
            return node(argument);
          }

          return objectSteps(Record.toEntries(argument));
        }),
      );
    }

    if ("#literal" in expression) {
      return Result.map(literal(expression["#literal"]), (text) =>
        annotatedSteps("#literal", [text], expression["#type"]),
      );
    }

    if ("#struct" in expression) {
      return Result.succeed(
        annotatedSteps(
          "#struct",
          objectSteps(Record.toEntries(expression["#struct"])),
          expression["#type"],
        ),
      );
    }

    if ("#tuple" in expression) {
      return Result.succeed(
        annotatedSteps(
          "#tuple",
          arraySteps(expression["#tuple"], node),
          expression["#type"],
        ),
      );
    }

    if ("#list" in expression) {
      return Result.succeed(
        annotatedSteps(
          "#list",
          arraySteps(expression["#list"], node),
          expression["#type"],
        ),
      );
    }

    if (!("#dict" in expression)) {
      return Result.fail(
        new SchemaIssue.InvalidValue(
          { message: "Expected an object with a constructor key" },
          expression,
        ),
      );
    }

    const entries = expression["#dict"];

    if (isReadonlyArray(entries)) {
      return Result.succeed(
        annotatedSteps(
          "#dict",
          arraySteps(entries, ([key, value]) => arraySteps([key, value], node)),
          expression["#type"],
        ),
      );
    }

    return Result.succeed(
      annotatedSteps(
        "#dict",
        objectSteps(Record.toEntries(entries)),
        expression["#type"],
      ),
    );
  };

const printUnchecked = tryPrinter(expand(uncheckedLiteral));
const printChecked = tryPrinter(expand(checkedLiteral));

/**
 * Writes an expression tree as compact J-Expr JSON text, checking each numeric literal's spelling as it goes.
 *
 * Numeric literal text that `JExpr.make` would reject, such as `NaN` or an Integer holding `1.5`, fails with the schema's issue. An object with no constructor key fails with an `InvalidValue` issue. It checks nothing else and trusts the rest of the tree to match its type.
 */
export const compileResult = (
  expression: Expression,
): Result.Result<string, SchemaIssue.Issue> => printChecked(node(expression));

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
  Result.getOrThrowWith(
    printUnchecked(node(expression)),
    (issue) => new TypeError(SchemaIssue.makeFormatterDefault()(issue)),
  );
