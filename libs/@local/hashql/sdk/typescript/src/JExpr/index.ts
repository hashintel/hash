/**
 * Builds, checks and serializes raw HashQL J-Expr syntax.
 *
 * J-Expr is HashQL's JSON notation. Arrays are calls, objects keyed by `#literal`, `#struct`, `#tuple`, `#list` or `#dict` construct data, and strings are source text that HashQL parses as a name, path or type. The string `"user"` therefore refers to a value by name. Use {@link literal} for data: `literal("user")` is the string value `"user"`.
 *
 * The builders return the SDK's {@link Expression} tree, not J-Expr text. The tree stores each numeric literal as tagged source text, such as `{ _tag: "Integer", value: "42" }`, to keep integers beyond JavaScript's precision and the distinction between `1` and `1.0`. {@link compile} writes the tree as J-Expr JSON, where those literals become bare JSON numbers. `JSON.stringify` and {@link Schema} encoding keep the tagged objects, so neither produces J-Expr.
 *
 * Builders such as {@link literal}, {@link struct} and {@link call} assemble syntax without validating it, and nothing in this module executes a query. {@link make} checks a finished tree against {@link Schema} and throws on failure. {@link makeEffect} keeps the issue in an Effect, and {@link makeOption} returns `None`. The schema checks structure, identifier-named fields and labels, and numeric spelling. It does not parse string expressions or `#type` annotations, resolve names or check types. The HashQL compiler does that when it receives the program.
 *
 * Builders that take a type, such as {@link input} and {@link typed}, accept the tagged syntax built by {@link Type}. {@link Ident} and {@link Path} decode and print single identifiers and paths. Each constructor also has a namespace, such as `Literal` or `Call`, holding its schema, value type and checked `make` functions.
 *
 * @example <caption>Bind a value, check the tree and serialize it.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr } from "@local/hashql";
 *
 * const query = JExpr.make(JExpr.let("name", JExpr.literal("Alice"), "name"));
 * assert.equal(JExpr.compile(query), '["::kernel::special_form::let","name",{"#literal":"Alice"},"name"]');
 * ```
 *
 * @module
 */

import { dual } from "effect/Function";

import { isReadonlyArray } from "../internal/array.js";
import * as Overflow from "../internal/overflow.js";
import * as Defs from "./schema.js";
import * as Type from "./Type/index.js";

import type * as Reference from "./Type/Reference.js";
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
export type * as ParserError from "./ParserError.js";
export * as Path from "./Path.js";
export * as Type from "./Type/index.js";
export { compile } from "./compile.js";

/**
 * Effect schema for the SDK's {@link Expression} tree.
 *
 * Decoding and {@link make} check the tree's structure, identifier-named struct fields and labels, and numeric literal spelling. They accept any string expression and any `#type` text. The encoded form, {@link Expression.Encoded}, keeps the tagged numeric literals, so use {@link compile} to produce J-Expr JSON text.
 */
export const Schema: typeof Defs.Expression = Defs.Expression;

/**
 * An SDK expression tree: a call array, a data constructor object or a string expression.
 *
 * A string is source text that HashQL parses, such as `"user"`, `"entity.properties"` or the placeholder `"_"`, rather than a string value. Numeric literals hold tagged source text, so serialize a tree with {@link compile} rather than `JSON.stringify`.
 */
export type Expression = Defs.ExpressionType;

export declare namespace Expression {
  /** The schema-encoded tree, with the same tagged numeric literals as {@link Expression}. */
  export type Encoded = Defs.ExpressionEncoded;
}

/** Constructor input accepted by {@link Schema} before validation. */
type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks an expression tree against {@link Schema} and returns the checked tree.
 *
 * The result is a new tree without keys outside the matched constructor. Numeric literal objects may omit `_tag`, which the result supplies. `options.disableChecks` skips the identifier, label and numeric-spelling checks but still requires the tree's structure. `options.parseOptions` passes Effect parse options, such as `onExcessProperty: "error"` to reject unknown keys. Use {@link makeOption} when only validity matters, or {@link makeEffect} to inspect a {@link SchemaIssue.Issue} with the failing node's location.
 *
 * @throws {Error} If validation fails. The error carries a {@link SchemaIssue.Issue} in its `cause`.
 *
 * @example <caption>Check a struct and detect an invalid field name.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr } from "@local/hashql";
 * import { Option } from "effect";
 *
 * const person = JExpr.make(JExpr.struct({ name: JExpr.literal("Alice") }));
 * assert.equal(JExpr.compile(person), '{"#struct":{"name":{"#literal":"Alice"}}}');
 *
 * const invalid = JExpr.struct({ "not an ident": JExpr.literal("x") });
 * assert.ok(Option.isNone(JExpr.makeOption(invalid)));
 * assert.throws(() => JExpr.make(invalid), { message: "Schema validation failed" });
 * ```
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Expression = Overflow.make(Schema);

/** Checks a tree like {@link make}, failing the synchronous effect with the {@link SchemaIssue.Issue} instead of throwing. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Expression, SchemaIssue.Issue> = Overflow.makeEffect(Schema);

/** Checks a tree like {@link make}, returning `None` instead of throwing for a schema failure. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Expression> = Overflow.makeOption(Schema);

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
 * Creates an integer literal from a value's exact decimal digits.
 *
 * A `bigint` keeps every digit. A `number` contributes the digits of its double value. An integer beyond `Number.MAX_SAFE_INTEGER` may therefore have lost precision before this call. `-0` becomes `0`. A non-integral or non-finite number keeps its JavaScript text without an error. {@link make} rejects that literal, while {@link compile} emits the text, such as `1.5` or `NaN`. See `JExpr.Integer.Integer` for a precision example.
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
 * The text is JavaScript's shortest decimal for the double, so `float(0.1 + 0.2)` compiles to `0.30000000000000004`. HashQL reads a number as a float only when its text has a fraction or exponent. Integral values therefore gain a fraction: `float(1)` compiles to `1.0` and `-0` to `-0.0`. Magnitudes that JavaScript writes in exponent form keep it, such as `1e+21`. The builder accepts `NaN` and infinities without an error. {@link make} rejects them, and {@link compile} emits text that is not JSON. See {@link compile} for float examples.
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
 * A string becomes a string value, unlike a bare string expression. Every `bigint` and every integral number, including `1.0`, `-0` and `1e21`, becomes an {@link integer} literal. Other numbers become {@link float} literals. Use {@link float} explicitly to keep `1` as `1.0` or preserve negative zero. See {@link make} for a string literal example.
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
 * HashQL infers the element type. Use {@link tuple} when each position needs its own type.
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
 * Field names must be identifiers, such as `name`, `+` or `` `+` ``. {@link make} checks the names, and this builder does not. Each field has its own type. Use {@link dict} for arbitrary string keys. Fields follow the record's own enumerable string-key order. The tree holds the given record object rather than a copy. See {@link make} for a struct example.
 */
export const struct = (
  fields: Record.ReadonlyRecord<string, Expression>,
): Defs.StructType => ({ "#struct": fields });

/**
 * Creates a dictionary from string keys or key expressions.
 *
 * Record keys are literal strings, even when they look like paths. JavaScript puts integer-like record keys first in ascending order, and {@link compile} keeps that order. Use `[key, value]` pairs to compute keys from expressions or to control their order. The tree holds the given record or array rather than a copy. See `JExpr.Dict.Dict` for examples of both key forms.
 */
export const dict = (
  entries:
    | Record.ReadonlyRecord<string, Expression>
    | readonly (readonly [Expression, Expression])[],
): Defs.DictType => ({ "#dict": entries });

/**
 * Sets a data constructor's type annotation.
 *
 * Returns a shallow copy with `#type` set. The new annotation replaces any existing one. The annotation is the type's annotation text, such as `(name: String)`, which HashQL parses and checks. Calls and paths cannot carry this field. Use {@link asType | as} to assert their types. Call it data-first as `typed(self, type)` or data-last in a pipeline.
 *
 * @example <caption>Annotate a literal with type syntax.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr } from "@local/hashql";
 * import { Option, pipe } from "effect";
 *
 * const number = Option.getOrThrow(JExpr.Type.reference("::kernel::type::Number"));
 * const annotated = pipe(JExpr.literal(3.14), JExpr.typed(number));
 * assert.equal(JExpr.compile(annotated), '{"#literal":3.14,"#type":"::kernel::type::Number"}');
 * ```
 */
export const typed: {
  (type: Type.Type): <E extends Annotatable>(self: E) => E;
  <E extends Annotatable>(self: E, type: Type.Type): E;
} = dual(2, <E extends Annotatable>(self: E, type: Type.Type): E => ({
  ...self,
  "#type": Type.compile(type),
}));

/**
 * Creates a labeled argument for {@link call}, such as `{":name": value}`.
 *
 * Give `name` without the leading `:`. It must be an identifier. {@link make} checks it, and this builder does not. The object keeps its place in the call array. HashQL's parser gathers labeled arguments into their own list, so this one takes no positional slot. See {@link call} for a labeled call example.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructor, not an operation on its first argument
export const label = (
  name: string,
  value: Expression,
): Defs.LabeledArgumentType => ({ [`:${name}`]: value });

/**
 * Builds a call to a function expression.
 *
 * `fn` can be a path or an expression that produces a function, including a closure from {@link fn}. Arguments keep their supplied order in the array, including those created with {@link label}. Neither this builder nor {@link make} checks the function's arity or argument types.
 *
 * @example <caption>Call a function with a positional and a labeled argument.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr } from "@local/hashql";
 *
 * const greeting = JExpr.call("greet", "user", JExpr.label("style", JExpr.literal("formal")));
 * assert.equal(JExpr.compile(greeting), '["greet","user",{":style":{"#literal":"formal"}}]');
 * ```
 */
export const call = (
  fn: Expression,
  ...args: readonly (Expression | Defs.LabeledArgumentType)[]
): Defs.CallType => [fn, ...args];

/**
 * Selects a branch according to a Boolean expression.
 *
 * Both branches are already built syntax, so this call runs no host code for either of them. HashQL evaluates only the selected branch when the query runs. Without `otherwise`, or with `otherwise` set to `undefined`, the expression produces HashQL's `Some(then)` when the condition is true and `None` when it is false.
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
 * The builder emits `name` as given, and the HashQL compiler checks that it is an identifier. To annotate the binding, pass `{ name, type }` with the type in constructor syntax, as {@link asType | as} takes it. That emits `let name: type = value in body`, and the HashQL compiler checks that the value is compatible with the annotation.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructor, not an operation on its first argument
const binding = (
  name: string | { readonly name: string; readonly type: Type.Type },
  value: Expression,
  body: Expression,
): Defs.CallType => {
  if (typeof name === "string") {
    return ["::kernel::special_form::let", name, value, body];
  }

  return [
    "::kernel::special_form::let",
    name.name,
    Type.toExpression(name.type),
    value,
    body,
  ];
};

export { binding as let };

/**
 * Asserts an expression's type for the HashQL type checker.
 *
 * The assertion constrains the expression's type without converting its value. A compound type takes constructor syntax, such as a `::kernel::type::Union` call or a `#struct` of types, rather than annotation text. Use {@link typed} to put an annotation directly on a data constructor.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructor, not an operation on its first argument
const asType = (value: Expression, type: Type.Type): Defs.CallType => [
  "::kernel::special_form::as",
  value,
  Type.toExpression(type),
];

export { asType as as };

/**
 * Items to import into the body of {@link use}.
 *
 * Use `"*"` for all items or an array for named imports. For aliases, supply a record from original name to local name: `{ entities: "allEntities" }` imports `entities` as `allEntities`. The alias `"_"` keeps the original name. An array becomes a `#tuple` of names and a record becomes a `#struct`, whose keys {@link make} checks as identifiers.
 */
export type Imports =
  | "*"
  | readonly string[]
  | Record.ReadonlyRecord<string, string>;

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
 * `path` is path text, such as `::core::math`, which the HashQL compiler resolves. {@link Imports} describes wildcard imports, named imports and aliases.
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
 * Without `defaultValue`, or with `defaultValue` set to `undefined`, the host must supply the input. Otherwise, HashQL evaluates `defaultValue`, asserted as `type`, when the input is absent. Build `type` with {@link Type}.
 *
 * @example <caption>Read an optional page size.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr } from "@local/hashql";
 * import { Option } from "effect";
 *
 * const integer = Option.getOrThrow(JExpr.Type.reference("::kernel::type::Integer"));
 * const pageSize = JExpr.input("page_size", integer, JExpr.integer(10));
 * assert.equal(JExpr.compile(pageSize), '["::kernel::special_form::input","page_size","::kernel::type::Integer",{"#literal":10}]');
 * ```
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
 * Give a field identifier as a string or a zero-based tuple position as a number. A number becomes an {@link integer} literal, so a non-integral position fails {@link make}. Use {@link index} when the selector is an expression. A string expression such as `"entity.properties"` is HashQL shorthand for the same named field access.
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

const compileName = (name: string | Reference.Reference): string => {
  if (typeof name === "string") {
    return name;
  }

  return Type.compile(name);
};

/**
 * Introduces a type alias in `body`.
 *
 * The alias denotes the same type as `type`. Use {@link newtype} for a distinct nominal type with a constructor. `name` is text emitted as given, such as `"Pair<T>"`, or reference type syntax, which compiles to the same form. Its generic list declares the alias's parameters, such as `T` or `T: Integer`.
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
