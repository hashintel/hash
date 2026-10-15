/**
 * Builds HashQL type syntax for J-Expr queries.
 *
 * A {@link Type} is tagged type syntax. Use {@link reference} for a named type and {@link struct}, {@link tuple}, {@link union} or {@link intersection} to compose types. The syntax has two J-Expr spellings. {@link compile} writes annotation text for a `#type` field, and {@link toExpression} writes the constructor syntax that `as`, `input`, `fn`, `type` and `newtype` emit.
 *
 * {@link reference} and {@link struct} return an {@link Option.Option}: an invalid name produces `None`. The other builders accept their members without checks. Name resolution and type checking belong to the HashQL compiler.
 *
 * @module
 */
import { Array, Option, Record, Result, SchemaParser, Tuple } from "effect";
import { compose, dual, pipe } from "effect/Function";

import * as Ident from "../Ident.js";
import * as Path from "../Path.js";
import * as Defs from "./schema.js";

import type { Identifier } from "../Identifier.js";
import type { ExpressionType } from "../schema.js";
import type { Schema as $Schema, Effect, SchemaIssue } from "effect";
import type { NonEmptyReadonlyArray } from "effect/Array";

export * as Generic from "./Generic.js";
export * as GenericArgument from "./GenericArgument.js";
export * as GenericBound from "./GenericBound.js";
export * as Intersection from "./Intersection.js";
export * as Reference from "./Reference.js";
export * as Struct from "./Struct.js";
export * as Tuple from "./Tuple.js";
export * as Union from "./Union.js";

/**
 * Schema for validating and encoding {@link Type} values.
 *
 * Use {@link make} to construct a value or {@link compile} to render type syntax. Schema encoding produces the tagged object representation described by {@link Encoded}.
 */
export const Schema: typeof Defs.Type = Defs.Type;

/**
 * Tagged HashQL type syntax, as accepted by `JExpr.input`, `JExpr.as`, `JExpr.typed` and the other builders that take a type.
 *
 * The `_tag` discriminant selects the form. `Reference` names a type by path with optional generics, `Struct` and `Tuple` list named or positional members, and `Union` and `Intersection` combine member types. Paths and member names are decoded identifier objects. `TypeExpression.toType` extracts this syntax from a declared type expression. Nothing validates an object written directly until {@link make} checks its names, and the HashQL compiler resolves those names and checks the type.
 */
export type Type = Defs.Type;

/**
 * The schema-encoded form of a {@link Type}, which writes each path and member name as source text.
 *
 * A reference's path becomes text such as `"::core::List"`, and a struct member name becomes text such as `` "`+`" ``. The rest keeps its tagged objects. {@link Schema} encodes and decodes this form, and neither form is J-Expr. Use {@link compile} or {@link toExpression} for J-Expr.
 */
export type Encoded = Defs.TypeEncoded;

/** Constructor input accepted by {@link Schema} before validation. */
type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks a tagged type object, including its decoded paths and names, and returns a new value.
 *
 * Validates the input against {@link Schema} by default. `options.disableChecks` skips the identifier checks but still requires the tagged structure. {@link makeOption} returns `None` for validation failures, and {@link makeEffect} preserves the issue in its error channel.
 *
 * @throws {Error} If construction fails. A schema-validation error carries a {@link SchemaIssue.Issue} in its `cause`.
 *
 * @example <caption>Construct and check tagged type syntax.</caption>
 * ```ts
 * import { Effect, Option } from "effect";
 * import * as Type from "./index.js";
 *
 * const integer = Type.make({
 *   _tag: "Reference",
 *   path: { rooted: false, segments: [{ _tag: "Lexical", value: "Integer" }] },
 *   generics: [],
 * });
 * Type.compile(integer); // => "Integer"
 *
 * const invalid = {
 *   _tag: "Reference",
 *   path: { rooted: false, segments: [{ _tag: "Lexical", value: "" }] },
 *   generics: [],
 * } as const;
 * Option.isNone(Type.makeOption(invalid)); // => true
 *
 * const empty = Effect.runSync(Type.makeEffect({ _tag: "Tuple", members: [] }));
 * Type.compile(empty); // => "()"
 * ```
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => Type =
  SchemaParser.make(Schema);

/**
 * Constructs a type with schema failures in the effect's error channel.
 *
 * Uses the construction options described by {@link make}. Fails with a {@link SchemaIssue.Issue} if the input fails schema validation.
 *
 * @see {@link make} for construction examples.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Type, SchemaIssue.Issue> = SchemaParser.makeEffect(Schema);

/**
 * Constructs a type, returning `None` if schema validation fails.
 *
 * Uses the construction options described by {@link make}. Use {@link makeEffect} when you need the validation issue.
 *
 * @see {@link make} for construction examples.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Type> = SchemaParser.makeOption(Schema);

/**
 * Creates a type whose values satisfy at least one member type.
 *
 * Preserves member order, duplicates and nested unions. Use {@link or} to combine types while flattening union operands.
 *
 * @example <caption>Build a union without flattening.</caption>
 * ```ts
 * import { Option } from "effect";
 * import * as Type from "./index.js";
 *
 * const integer = Option.getOrThrow(Type.reference("Integer"));
 * const string = Option.getOrThrow(Type.reference("String"));
 * Type.compile(Type.union(integer, string)); // => "(Integer | String)"
 * Type.compile(Type.union(integer)); // => "Integer"
 * ```
 */
export const union = (
  ...members: NonEmptyReadonlyArray<Type>
): Defs.UnionType => ({ _tag: "Union", members });

/**
 * Creates a type whose values satisfy every member type.
 *
 * Preserves member order, duplicates and nested intersections. Use {@link and} to combine types while flattening intersection operands.
 *
 * @example <caption>Build an intersection.</caption>
 * ```ts
 * import { Option } from "effect";
 * import * as Type from "./index.js";
 *
 * const named = Option.getOrThrow(Type.reference("Named"));
 * const aged = Option.getOrThrow(Type.reference("Aged"));
 * Type.compile(Type.intersection(named, aged)); // => "(Named & Aged)"
 * ```
 */
export const intersection = (
  ...members: NonEmptyReadonlyArray<Type>
): Defs.IntersectionType => ({ _tag: "Intersection", members });

/** Exposes a readonly view of a value without copying or freezing it. */
const asReadonlyUnsafe = <T>(input: T): Readonly<T> => input;

/**
 * Creates a type with named fields.
 *
 * Returns `None` if any field name is not a valid identifier according to `Ident.decodeResult`. Symbol names accept bare (`+`) or backticked (`` `+` ``) spelling. Fields follow the record's own enumerable string-key order. An empty record produces an empty struct, which {@link compile} renders as `(:)`.
 *
 * @example <caption>Build a struct type and reject an invalid field name.</caption>
 * ```ts
 * import { Option } from "effect";
 * import * as Type from "./index.js";
 *
 * const string = Option.getOrThrow(Type.reference("String"));
 * const integer = Option.getOrThrow(Type.reference("Integer"));
 * const person = Option.getOrThrow(Type.struct({ name: string, age: integer }));
 * Type.compile(person); // => "(name: String, age: Integer)"
 * Option.isNone(Type.struct({ "": string })); // => true
 * Type.compile(Option.getOrThrow(Type.struct({}))); // => "(:)"
 * ```
 */
export const struct = (
  fields: Record.ReadonlyRecord<string, Type>,
): Option.Option<Defs.StructType> =>
  pipe(
    Record.toEntries(fields),
    Array.map(
      compose(
        Tuple.evolve([
          compose(Ident.decodeResult, Result.getSuccess),
          Option.some<Type>,
        ]),
        Option.all,
      ),
    ),
    Option.all,
    Option.map(asReadonlyUnsafe),
    Option.map((members) => ({
      _tag: "Struct",
      members,
    })),
  );

/**
 * Creates a type with positional fields.
 *
 * An empty tuple compiles to `()`. A single-member tuple keeps a trailing comma to distinguish it from a parenthesized type.
 *
 * @example <caption>Build empty, single-member and pair tuples.</caption>
 * ```ts
 * import { Option } from "effect";
 * import * as Type from "./index.js";
 *
 * const integer = Option.getOrThrow(Type.reference("Integer"));
 * Type.compile(Type.tuple()); // => "()"
 * Type.compile(Type.tuple(integer)); // => "(Integer,)"
 * Type.compile(Type.tuple(integer, integer)); // => "(Integer, Integer)"
 * ```
 */
export const tuple = (...members: readonly Type[]): Defs.TupleType => ({
  _tag: "Tuple",
  members,
});

/**
 * Refers to a named type with optional generic arguments or bounds.
 *
 * `path` uses path syntax, such as `Integer`, `core::math::add` or `::core::math::+`. Returns `None` if `Path.decodeResult` rejects it, including text with generic arguments such as `List<Integer>`. Validation checks syntax only. The HashQL compiler resolves the name and checks its generic arguments.
 *
 * A plain {@link Type} supplies a positional generic argument. An explicit `GenericArgument` or `GenericBound` object from the `Generic` module keeps its form. Generic order follows the argument list.
 *
 * @example <caption>Refer to generic, bounded and rooted types.</caption>
 * ```ts
 * import { Option } from "effect";
 * import * as Generic from "./Generic.js";
 * import * as Type from "./index.js";
 *
 * const integer = Option.getOrThrow(Type.reference("Integer"));
 * const list = Option.getOrThrow(Type.reference("List", integer));
 * Type.compile(list); // => "List<Integer>"
 *
 * const bounded = Option.getOrThrow(
 *   Type.reference("List", Option.getOrThrow(Generic.bound("T", integer))),
 * );
 * Type.compile(bounded); // => "List<T: Integer>"
 *
 * const rooted = Option.getOrThrow(Type.reference("::core::math::+", integer));
 * Type.compile(rooted); // => "::core::math::`+`<Integer>"
 * Option.isNone(Type.reference("")); // => true
 * ```
 */
export const reference = (
  path: string,
  ...generics: readonly (Type | Defs.GenericType)[]
): Option.Option<Defs.ReferenceType> =>
  Option.all({
    _tag: Option.some("Reference" as const),
    path: Path.decodeResult(path).pipe(Result.getSuccess),
    generics: Option.some(
      generics.map((generic): Defs.GenericType => {
        if (
          generic._tag === "GenericArgument" ||
          generic._tag === "GenericBound"
        ) {
          return generic;
        }

        return { _tag: "GenericArgument", bound: generic };
      }),
    ),
  });

/** Treats a non-union type as a single union member. */
const unionMembers = (type: Type): NonEmptyReadonlyArray<Type> => {
  if (type._tag === "Union") {
    return type.members;
  }

  return [type];
};

/** Treats a non-intersection type as a single intersection member. */
const intersectionMembers = (type: Type): NonEmptyReadonlyArray<Type> => {
  if (type._tag === "Intersection") {
    return type.members;
  }

  return [type];
};

/**
 * Combines types into a union, flattening union operands by one level.
 *
 * Members of `self` precede members of `that`. Duplicates remain. Chained calls produce a flat union when the initial operands have no nested unions. Use {@link union} to preserve nesting.
 *
 * @example <caption>Chain unions with flattening.</caption>
 * ```ts
 * import { Option } from "effect";
 * import { pipe } from "effect/Function";
 * import * as Type from "./index.js";
 *
 * const integer = Option.getOrThrow(Type.reference("Integer"));
 * const string = Option.getOrThrow(Type.reference("String"));
 * const boolean = Option.getOrThrow(Type.reference("Boolean"));
 * const value = pipe(integer, Type.or(string), Type.or(boolean));
 * Type.compile(value); // => "(Integer | String | Boolean)"
 * Type.compile(Type.or(integer, string)); // => "(Integer | String)"
 * ```
 */
export const or: {
  (that: Type): (self: Type) => Defs.UnionType;
  (self: Type, that: Type): Defs.UnionType;
} = dual(
  2,
  (self: Type, that: Type): Defs.UnionType => ({
    _tag: "Union",
    members: [...unionMembers(self), ...unionMembers(that)],
  }),
);

/**
 * Combines types into an intersection, flattening its operands once.
 *
 * An intersection operand contributes its immediate members. Members of `self` precede members of `that`. Duplicates remain. Chained calls produce a flat intersection when the initial operands have no nested intersections. Use {@link intersection} to preserve nesting.
 *
 * @example <caption>Chain intersections with flattening.</caption>
 * ```ts
 * import { Option } from "effect";
 * import { pipe } from "effect/Function";
 * import * as Type from "./index.js";
 *
 * const named = Option.getOrThrow(Type.reference("Named"));
 * const aged = Option.getOrThrow(Type.reference("Aged"));
 * const located = Option.getOrThrow(Type.reference("Located"));
 * const person = pipe(named, Type.and(aged), Type.and(located));
 * Type.compile(person); // => "(Named & Aged & Located)"
 * Type.compile(Type.and(named, aged)); // => "(Named & Aged)"
 * ```
 */
export const and: {
  (that: Type): (self: Type) => Defs.IntersectionType;
  (self: Type, that: Type): Defs.IntersectionType;
} = dual(
  2,
  (self: Type, that: Type): Defs.IntersectionType => ({
    _tag: "Intersection",
    members: [...intersectionMembers(self), ...intersectionMembers(that)],
  }),
);

/** Delimits a compound type expression to preserve its grouping. */
const parenthesize = (
  members: readonly Type[],
  separator: string,
): Identifier =>
  // oxlint-disable-next-line no-use-before-define -- recursive printer
  `(${members.map((member) => compile(member)).join(separator)})`;

/** Renders a positional argument or named bound within a generic argument list. */
const compileGeneric: (generic: Defs.GenericType) => Identifier =
  Defs.Generic.match({
    // oxlint-disable-next-line no-use-before-define -- recursive printer
    GenericArgument: ({ bound }) => compile(bound),
    GenericBound: ({ name, bound }) => {
      if (bound === undefined) {
        return Ident.compile(name);
      }

      // oxlint-disable-next-line no-use-before-define -- recursive printer
      return `${Ident.compile(name)}: ${compile(bound)}`;
    },
  });

/**
 * Compiles a type into J-Expr type syntax.
 *
 * Unions and intersections with more than one member always retain parentheses to preserve grouping in nested expressions. A single-member union or intersection compiles as its member. Empty structs use `(:)`, empty tuples use `()`, and single-member tuples retain a trailing comma.
 *
 * @example <caption>Compile a nested type.</caption>
 * ```ts
 * import { Option } from "effect";
 * import * as Type from "./index.js";
 *
 * const integer = Option.getOrThrow(Type.reference("Integer"));
 * const string = Option.getOrThrow(Type.reference("String"));
 * const list = Option.getOrThrow(
 *   Type.reference("List", Type.union(integer, string)),
 * );
 * Type.compile(list); // => "List<(Integer | String)>"
 * ```
 */
export const compile: (type: Type) => Identifier = Defs.Type.match({
  Union: ({ members }) => {
    const [first, ...rest] = members;

    if (rest.length === 0) {
      return compile(first);
    }

    return parenthesize(members, " | ");
  },
  Intersection: ({ members }) => {
    const [first, ...rest] = members;

    if (rest.length === 0) {
      return compile(first);
    }

    return parenthesize(members, " & ");
  },
  Struct: ({ members }) => {
    if (members.length === 0) {
      return "(:)";
    }

    const fields = members.map(
      ([name, member]) => `${Ident.compile(name)}: ${compile(member)}`,
    );

    return `(${fields.join(", ")})`;
  },
  Tuple: ({ members }) => {
    const [only, ...rest] = members;

    if (only === undefined) {
      return "()";
    }

    if (rest.length === 0) {
      return `(${compile(only)},)`;
    }

    return parenthesize(members, ", ");
  },
  Reference: ({ path, generics }) => {
    if (generics.length === 0) {
      return Path.compile(path);
    }

    const args = generics.map((generic) => compileGeneric(generic));
    return `${Path.compile(path)}<${args.join(", ")}>`;
  },
});

/**
 * Encodes a type in an expression position, such as a type definition or closure parameter.
 *
 * Compound types use constructors here. Only annotation positions accept their type-syntax strings.
 */
export const toExpression: (type: Type) => ExpressionType = Defs.Type.match({
  Reference: compile,
  Tuple: ({ members }) => ({ "#tuple": members.map(toExpression) }),
  Struct: ({ members }) => ({
    "#struct": Object.fromEntries(
      members.map(([name, member]) => [
        Ident.compile(name),
        toExpression(member),
      ]),
    ),
  }),
  Union: ({ members }): ExpressionType => [
    "::kernel::type::Union",
    ...members.map(toExpression),
  ],
  Intersection: ({ members }): ExpressionType => [
    "::kernel::type::Intersection",
    ...members.map(toExpression),
  ],
});
