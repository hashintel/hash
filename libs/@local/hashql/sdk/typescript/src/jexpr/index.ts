/**
 * Builds HashQL queries as J-Expr expression trees.
 *
 * A string such as `"user"` refers to a value by name. Use {@link literal} for data: `literal("user")` is the string value `"user"`. Arrays represent calls, while objects with keys such as `#list` or `#struct` construct data.
 *
 * @example
 * ```ts
 * import * as JExpr from "./index.js";
 *
 * const query = JExpr.let("name", JExpr.literal("Alice"), "name");
 * JExpr.compile(JExpr.make(query));
 * // => '["let","name",{"#literal":"Alice"},"name"]'
 * ```
 *
 * The helpers assemble expressions without validating them. Use {@link make} to check the finished tree and {@link compile} to produce JSON text. {@link makeEffect} retains validation issues in an Effect, and {@link makeOption} returns only success or failure. The schema checks the tree's structure. Parsing strings as paths or types, resolving names and type checking belong to the HashQL compiler.
 *
 * Use {@link compile} even when the tree looks like ordinary JSON. Numeric literals retain their source text to preserve large integers and the distinction between `1` and `1.0`.
 *
 * @module
 */
import { SchemaParser } from "effect";
import { dual } from "effect/Function";

import { isReadonlyArray } from "../internal/array.js";
import * as Defs from "./schema.js";
import * as Type from "./type/index.js";

import type * as Reference from "./type/Reference.js";
import type {
  Schema as $Schema,
  Effect,
  Option,
  Record,
  SchemaIssue,
} from "effect";

export * as Call from "./Call.js";
export * as Dict from "./Dict.js";
export * as Float from "./Float.js";
export * as Identifier from "./Identifier.js";
export * as Integer from "./Integer.js";
export * as LabeledArgument from "./LabeledArgument.js";
export * as List from "./List.js";
export * as Literal from "./Literal.js";
export * as Struct from "./Struct.js";
export * as Tuple from "./Tuple.js";
export * as Ident from "./Ident.js";
export * as Path from "./Path.js";
export { compile } from "./compile.js";

/**
 * Schema for the SDK's expression-tree representation.
 *
 * Encoding produces {@link Encoded}, including tagged numeric literals. Use {@link compile} to produce J-Expr JSON text.
 */
export const Schema: typeof Defs.Expression = Defs.Expression;

/** A J-Expr expression: a call, a data constructor or a string. */
export type Expression = Defs.ExpressionType;

/** The schema-encoded tree, with the same tagged numeric literals as {@link Expression}. */
export type Encoded = Defs.ExpressionEncoded;

/** Constructor input accepted by {@link Schema} before validation. */
type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks an expression tree against {@link Schema}.
 *
 * Validates by default. `options.disableChecks` skips schema checks. Use {@link makeOption} when only validity matters, or {@link makeEffect} to inspect a {@link SchemaIssue.Issue} with the failing node's location.
 *
 * @throws {Error} If validation fails. The error carries a {@link SchemaIssue.Issue} in its `cause`.
 *
 * @example
 * ```ts
 * import { Option } from "effect";
 * import * as JExpr from "./index.js";
 *
 * const query = JExpr.make(JExpr.struct({ name: JExpr.literal("Alice") }));
 * JExpr.compile(query); // => '{"#struct":{"name":{"#literal":"Alice"}}}'
 *
 * Option.isNone(JExpr.makeOption(JExpr.struct({ "not an ident": "x" }))); // => true
 * ```
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Expression = SchemaParser.make(Schema);

/** Checks a tree with {@link make}'s options, retaining schema issues in the effect's error channel. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Expression, SchemaIssue.Issue> =
  SchemaParser.makeEffect(Schema);

/** Checks a tree with {@link make}'s options, returning `None` for a schema failure. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Expression> = SchemaParser.makeOption(Schema);

export { fn, infer } from "./Function.js";
export type { FnOptions, TypeArgument } from "./Function.js";

/** Data constructors that accept a `#type` annotation through {@link typed}. */
export type Annotatable =
  | Defs.StructType
  | Defs.TupleType
  | Defs.DictType
  | Defs.ListType
  | Defs.LiteralType;

/**
 * Creates a whole-number literal without a size limit for `bigint` inputs.
 *
 * Use a `bigint` for integers beyond `Number.MAX_SAFE_INTEGER`. A `number` may already have lost precision before this call. It must be an integer to pass {@link make} validation. See {@link Integer.Integer} for a precision example.
 */
export const integer = (value: number | bigint): Defs.LiteralType => {
  if (typeof value === "number" && Number.isInteger(value)) {
    return { "#literal": { _tag: "Integer", value: BigInt(value).toString() } };
  }

  return { "#literal": { _tag: "Integer", value: String(value) } };
};

/**
 * Creates a numeric literal that HashQL parses as a float.
 *
 * A float's JSON spelling must contain a fraction or exponent. Integral values therefore retain a fraction: `float(1)` compiles to `1.0`. Negative zero compiles to `-0.0`. `NaN` and infinities fail {@link make} validation. See {@link compile} for float examples.
 */
export const float = (value: number): Defs.LiteralType => {
  if (Object.is(value, -0)) {
    return { "#literal": { _tag: "Float", value: "-0.0" } };
  }

  const text = String(value);

  if (Number.isInteger(value) && !text.includes("e")) {
    return { "#literal": { _tag: "Float", value: `${text}.0` } };
  }

  return { "#literal": { _tag: "Float", value: text } };
};

/**
 * Creates a literal from a primitive value.
 *
 * Integral numbers and `bigint` values become {@link integer} literals. Other numbers become {@link float} literals. Use {@link float} explicitly to keep `1` as `1.0` or preserve negative zero. See {@link make} for a string literal example.
 */
export const literal = (
  value: string | number | bigint | boolean | null,
): Defs.LiteralType => {
  if (typeof value === "bigint") {
    return integer(value);
  }

  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return integer(value);
    }

    return float(value);
  }

  return { "#literal": value };
};

/**
 * Creates a list whose elements share a type.
 *
 * HashQL infers the element type. Use {@link tuple} when each position needs its own type. See {@link compile} for a list example.
 */
export const list = (...items: readonly Expression[]): Defs.ListType => ({
  "#list": items,
});

/** Creates a fixed-length sequence with a type for each position. */
export const tuple = (...items: readonly Expression[]): Defs.TupleType => ({
  "#tuple": items,
});

/**
 * Creates a struct with named fields.
 *
 * Field names must be identifiers, such as `name` or `` `+` ``. Each field has its own type. Use {@link dict} for arbitrary string keys. Fields follow the record's own enumerable string-key order. See {@link make} for a struct example.
 */
export const struct = (
  fields: Record.ReadonlyRecord<string, Expression>,
): Defs.StructType => ({ "#struct": fields });

/**
 * Creates a dictionary from string keys or key expressions.
 *
 * Record keys are literal strings, even when they look like paths. Use `[key, value]` pairs to compute keys from expressions. See {@link Dict.Dict} for examples of both key forms.
 */
export const dict = (
  entries:
    | Record.ReadonlyRecord<string, Expression>
    | readonly (readonly [Expression, Expression])[],
): Defs.DictType => ({ "#dict": entries });

/**
 * Sets a data constructor's type annotation.
 *
 * Replaces any existing `#type` annotation. Calls and paths cannot carry this field. Use {@link asType | as} to assert their types.
 *
 * @example
 * ```ts
 * import { Option, pipe } from "effect";
 * import * as Type from "./type/index.js";
 * import * as JExpr from "./index.js";
 *
 * const float = Option.getOrThrow(Type.reference("Float"));
 * JExpr.compile(pipe(JExpr.literal(3.14), JExpr.typed(float)));
 * // => '{"#literal":3.14,"#type":"Float"}'
 * ```
 */
export const typed: {
  (type: Type.Type): <E extends Annotatable>(self: E) => E;
  <E extends Annotatable>(self: E, type: Type.Type): E;
} = dual(
  2,
  <E extends Annotatable>(self: E, type: Type.Type): E => ({
    ...self,
    "#type": Type.compile(type),
  }),
);

/**
 * Creates a labeled argument for {@link call}, such as `{":name": value}`.
 *
 * Give `name` without the leading `:`. It must be an identifier. The argument remains positional in the call's argument list. See {@link call} for a labeled call example.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructor, not an operation on its first argument
export const label = (
  name: string,
  value: Expression,
): Defs.LabeledArgumentType => ({ [`:${name}`]: value });

/**
 * Builds a call to a function expression.
 *
 * `fn` can be a path or an expression that produces a function, including a closure from {@link fn}. Arguments keep their supplied order, including those created with {@link label}.
 *
 * @example
 * ```ts
 * import * as JExpr from "./index.js";
 *
 * JExpr.compile(JExpr.call("greet", JExpr.label("name", JExpr.literal("Alice"))));
 * // => '["greet",{":name":{"#literal":"Alice"}}]'
 * ```
 */
export const call = (
  fn: Expression,
  ...args: readonly (Expression | Defs.LabeledArgumentType)[]
): Defs.CallType => [fn, ...args];

/**
 * Selects a branch according to a Boolean expression.
 *
 * HashQL evaluates only the selected branch. Without `otherwise`, the query produces HashQL's `Some(then)` when the condition is true and `None` when it is false.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructor, not an operation on its first argument
const conditional = (
  condition: Expression,
  then: Expression,
  otherwise?: Expression,
): Defs.CallType => {
  if (otherwise === undefined) {
    return ["::kernel::special_form::if", condition, then];
  }

  return ["::kernel::special_form::if", condition, then, otherwise];
};

export { conditional as if };

/**
 * Binds `value` to `name` within `body`.
 *
 * Use {@link asType | as} on `value` to give it an explicit type.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructor, not an operation on its first argument
const binding = (
  name: string,
  value: Expression,
  body: Expression,
): Defs.CallType => ["::kernel::special_form::let", name, value, body];

export { binding as let };

/**
 * Asserts an expression's type for the HashQL type checker.
 *
 * The assertion constrains the expression's type without converting its value. Use {@link typed} to put an annotation directly on a data constructor.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructor, not an operation on its first argument
const asType = (value: Expression, type: Type.Type): Defs.CallType => [
  "as",
  value,
  Type.toExpression(type),
];

export { asType as as };

/**
 * Items to import into the body of {@link use}.
 *
 * Use `"*"` for all items or an array for named imports. For aliases, supply a record from original name to local name: `{ entities: "allEntities" }` imports `entities` as `allEntities`. The alias `"_"` keeps the original name.
 */
export type Imports =
  | "*"
  | readonly string[]
  | Record.ReadonlyRecord<string, string>;

/** Renders an import selection as a wildcard, tuple or alias record. */
const compileImports = (imports: Imports): Expression => {
  if (imports === "*") {
    return imports;
  }

  if (isReadonlyArray(imports)) {
    return { "#tuple": imports };
  }

  return { "#struct": imports };
};

/**
 * Imports items from the module at `path` into `body`.
 *
 * {@link Imports} describes wildcard imports, named imports and aliases.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructor, not an operation on its first argument
export const use = (
  path: string,
  imports: Imports,
  body: Expression,
): Defs.CallType => [
  "::kernel::special_form::use",
  path,
  compileImports(imports),
  body,
];

/**
 * Reads a named query input supplied by the host.
 *
 * Without `defaultValue`, the host must supply the input. Otherwise, HashQL evaluates `defaultValue` when the input is absent.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructor, not an operation on its first argument
export const input = (
  name: string,
  type: Type.Type,
  defaultValue?: Expression,
): Defs.CallType => {
  if (defaultValue === undefined) {
    return ["::kernel::special_form::input", name, Type.toExpression(type)];
  }

  return [
    "::kernel::special_form::input",
    name,
    Type.toExpression(type),
    defaultValue,
  ];
};

/**
 * Selects a named field or a tuple position.
 *
 * Give a field identifier as a string or a zero-based tuple position as a number. Use {@link index} when the selector is an expression. Path strings such as `"entity.properties"` provide shorthand for named field access.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructor, not an operation on its first argument
export const access = (
  value: Expression,
  field: string | number,
): Defs.CallType => {
  if (typeof field === "number") {
    return ["::kernel::special_form::access", value, integer(field)];
  }

  return ["::kernel::special_form::access", value, field];
};

/**
 * Looks up a collection element using an index expression.
 *
 * Use {@link literal} for a fixed index. A string such as `"offset"` refers to a value in scope.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructor, not an operation on its first argument
export const index = (
  value: Expression,
  position: Expression,
): Defs.CallType => ["::kernel::special_form::index", value, position];

/** Renders a declaration name, including any generic parameters. */
const compileName = (name: string | Reference.Reference): string => {
  if (typeof name === "string") {
    return name;
  }

  return Type.compile(name);
};

/**
 * Introduces a type alias in `body`.
 *
 * The alias denotes the same type as `type`. Use {@link newtype} for a distinct nominal type with a constructor. `name` accepts type syntax such as `"Pair<T>"`, or a {@link Reference.Reference} declaring generic parameters.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructor, not an operation on its first argument
const typeAlias = (
  name: string | Reference.Reference,
  type: Type.Type,
  body: Expression,
): Defs.CallType => [
  "::kernel::special_form::type",
  compileName(name),
  Type.toExpression(type),
  body,
];

export { typeAlias as type };

/**
 * Introduces a distinct type and its constructor in `body`.
 *
 * The constructor has the same name as the type. `name` accepts generic parameters as described by {@link typeAlias | type}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructor, not an operation on its first argument
export const newtype = (
  name: string | Reference.Reference,
  type: Type.Type,
  body: Expression,
): Defs.CallType => [
  "::kernel::special_form::newtype",
  compileName(name),
  Type.toExpression(type),
  body,
];
