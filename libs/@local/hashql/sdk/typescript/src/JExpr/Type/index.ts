/**
 * Builds HashQL type syntax for J-Expr queries.
 *
 * A {@link Type} describes type syntax. Use {@link reference} for a named type and {@link struct}, {@link tuple}, {@link union} or {@link intersection} to compose types. The syntax has two J-Expr spellings. {@link compile} writes annotation text for a `#type` field, and {@link toExpression} writes the constructor syntax that `as`, `input`, `fn`, `type` and `newtype` emit.
 *
 * {@link reference} and {@link struct} return an {@link Option.Option}: an invalid name produces `None`. The other builders accept their members without checks. Name resolution and type checking belong to the HashQL compiler.
 *
 * @module
 */
import { Array, Option, Record, Result, Tuple } from "effect";
import { compose, dual, pipe } from "effect/Function";

import * as Overflow from "../../internal/overflow.js";
import { compileType } from "../../internal/type-compile.js";
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
 * The `_tag` discriminant selects the form. `Reference` names a type by path with optional generics. `Struct` lists named members and `Tuple` positional ones. `Union` and `Intersection` combine member types. `Infer` is the `_` placeholder for a type the compiler infers. Paths and member names hold decoded identifier objects. Nothing validates an object written directly until {@link make} checks its names, and the HashQL compiler resolves those names and checks the type.
 */
export type Type = Defs.Type;

/**
 * The schema-encoded form of a {@link Type}, which writes each path and member name as source text.
 *
 * A reference's path becomes text such as `"::core::List<Integer>"`, and a struct member name becomes text such as `` "`+`" ``. Path arguments use type syntax, which omits single-member union and intersection wrappers. Other type nodes keep their tagged objects. {@link Schema} encodes and decodes this form, and neither form is J-Expr. Use {@link compile} or {@link toExpression} for J-Expr.
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
 * import { JExpr } from "@local/hashql";
 *
 * const integer = JExpr.Type.make({
 *   _tag: "Reference",
 *   path: { rooted: false, segments: [{ name: { _tag: "Lexical", value: "Integer" }, arguments: [] }] },
 * });
 * JExpr.Type.compile(integer); // => "Integer"
 *
 * const invalid = {
 *   _tag: "Reference",
 *   path: { rooted: false, segments: [{ name: { _tag: "Lexical", value: "" }, arguments: [] }] },
 * } as const;
 * Option.isNone(JExpr.Type.makeOption(invalid)); // => true
 *
 * const empty = Effect.runSync(JExpr.Type.makeEffect({ _tag: "Tuple", members: [] }));
 * JExpr.Type.compile(empty); // => "()"
 * ```
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => Type =
  Overflow.make(Schema);

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
) => Effect.Effect<Type, SchemaIssue.Issue> = Overflow.makeEffect(Schema);

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
) => Option.Option<Type> = Overflow.makeOption(Schema);

/**
 * Creates a type whose values satisfy at least one member type.
 *
 * Preserves member order, duplicates and nested unions. Use {@link or} to combine types while flattening union operands.
 *
 * @example <caption>Build a union without flattening.</caption>
 * ```ts
 * import { Option } from "effect";
 * import { JExpr } from "@local/hashql";
 *
 * const integer = Option.getOrThrow(JExpr.Type.reference("Integer"));
 * const string = Option.getOrThrow(JExpr.Type.reference("String"));
 * JExpr.Type.compile(JExpr.Type.union(integer, string)); // => "Integer | String"
 * JExpr.Type.compile(JExpr.Type.union(integer)); // => "Integer"
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
 * import { JExpr } from "@local/hashql";
 *
 * const named = Option.getOrThrow(JExpr.Type.reference("Named"));
 * const aged = Option.getOrThrow(JExpr.Type.reference("Aged"));
 * JExpr.Type.compile(JExpr.Type.intersection(named, aged)); // => "Named & Aged"
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
 * import { JExpr } from "@local/hashql";
 *
 * const string = Option.getOrThrow(JExpr.Type.reference("String"));
 * const integer = Option.getOrThrow(JExpr.Type.reference("Integer"));
 * const person = Option.getOrThrow(JExpr.Type.struct({ name: string, age: integer }));
 * JExpr.Type.compile(person); // => "(name: String, age: Integer)"
 * Option.isNone(JExpr.Type.struct({ "": string })); // => true
 * JExpr.Type.compile(Option.getOrThrow(JExpr.Type.struct({}))); // => "(:)"
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
 * import { JExpr } from "@local/hashql";
 *
 * const integer = Option.getOrThrow(JExpr.Type.reference("Integer"));
 * JExpr.Type.compile(JExpr.Type.tuple()); // => "()"
 * JExpr.Type.compile(JExpr.Type.tuple(integer)); // => "(Integer,)"
 * JExpr.Type.compile(JExpr.Type.tuple(integer, integer)); // => "(Integer, Integer)"
 * ```
 */
export const tuple = (...members: readonly Type[]): Defs.TupleType => ({
  _tag: "Tuple",
  members,
});

/** Creates the `_` placeholder for compiler-inferred type syntax. */
export const infer = (): Defs.InferType => ({ _tag: "Infer" });

/** Converts builder generics into the argument model used by a path segment. */
const segmentArgument = (
  generic: Type | Defs.GenericType,
): Path.SegmentArgument => {
  if (generic._tag === "GenericArgument") {
    return generic;
  }

  if (generic._tag === "GenericBound") {
    if (generic.bound !== undefined) {
      return {
        _tag: "GenericConstraint",
        name: generic.name,
        bound: generic.bound,
      };
    }

    return {
      _tag: "GenericArgument",
      bound: {
        _tag: "Reference",
        path: {
          rooted: false,
          segments: [{ name: generic.name, arguments: [] }],
        },
      },
    };
  }

  return { _tag: "GenericArgument", bound: generic };
};

/**
 * Refers to a named type with optional generic arguments or bounds.
 *
 * `path` accepts the SDK syntax documented by {@link Path.parse}, including per-segment generic lists. Returns `None` if parsing fails. Additional generic arguments append to the last segment's existing arguments. This checks supported path syntax, not full language validity. The HashQL compiler normalizes and resolves names and checks types.
 *
 * A plain {@link Type} supplies a positional argument. A `GenericBound` with a bound supplies a named constraint. Without a bound it supplies a reference to its name. Generic order follows the argument list.
 *
 * @example <caption>Refer to generic, bounded and rooted types.</caption>
 * ```ts
 * import { Option } from "effect";
 * import { JExpr } from "@local/hashql";
 *
 * const integer = Option.getOrThrow(JExpr.Type.reference("Integer"));
 * const list = Option.getOrThrow(JExpr.Type.reference("List", integer));
 * JExpr.Type.compile(list); // => "List<Integer>"
 *
 * const bounded = Option.getOrThrow(
 *   JExpr.Type.reference("List", Option.getOrThrow(JExpr.Type.Generic.bound("T", integer))),
 * );
 * JExpr.Type.compile(bounded); // => "List<T: Integer>"
 *
 * const rooted = Option.getOrThrow(JExpr.Type.reference("::core::math::+", integer));
 * JExpr.Type.compile(rooted); // => "::core::math::`+`<Integer>"
 * Option.isNone(JExpr.Type.reference("")); // => true
 * ```
 */
export const reference = (
  path: string,
  ...generics: readonly (Type | Defs.GenericType)[]
): Option.Option<Defs.ReferenceType> =>
  pipe(
    Path.parse(path),
    Result.getSuccess,
    Option.map((parsed) => ({
      _tag: "Reference",
      path: {
        rooted: parsed.rooted,
        segments: Array.map(parsed.segments, (segment, index) => {
          if (index !== parsed.segments.length - 1) {
            return segment;
          }

          return {
            name: segment.name,
            arguments: [...segment.arguments, ...generics.map(segmentArgument)],
          };
        }),
      },
    })),
  );

const unionMembers = (type: Type): NonEmptyReadonlyArray<Type> => {
  if (type._tag === "Union") {
    return type.members;
  }

  return [type];
};

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
 * import { JExpr } from "@local/hashql";
 *
 * const integer = Option.getOrThrow(JExpr.Type.reference("Integer"));
 * const string = Option.getOrThrow(JExpr.Type.reference("String"));
 * const boolean = Option.getOrThrow(JExpr.Type.reference("Boolean"));
 * const value = pipe(integer, JExpr.Type.or(string), JExpr.Type.or(boolean));
 * JExpr.Type.compile(value); // => "Integer | String | Boolean"
 * JExpr.Type.compile(JExpr.Type.or(integer, string)); // => "Integer | String"
 * ```
 */
export const or: {
  (that: Type): (self: Type) => Defs.UnionType;
  (self: Type, that: Type): Defs.UnionType;
} = dual(2, (self: Type, that: Type): Defs.UnionType => ({
  _tag: "Union",
  members: [...unionMembers(self), ...unionMembers(that)],
}));

/**
 * Combines types into an intersection, flattening its operands once.
 *
 * An intersection operand contributes its immediate members. Members of `self` precede members of `that`. Duplicates remain. Chained calls produce a flat intersection when the initial operands have no nested intersections. Use {@link intersection} to preserve nesting.
 *
 * @example <caption>Chain intersections with flattening.</caption>
 * ```ts
 * import { Option } from "effect";
 * import { pipe } from "effect/Function";
 * import { JExpr } from "@local/hashql";
 *
 * const named = Option.getOrThrow(JExpr.Type.reference("Named"));
 * const aged = Option.getOrThrow(JExpr.Type.reference("Aged"));
 * const located = Option.getOrThrow(JExpr.Type.reference("Located"));
 * const person = pipe(named, JExpr.Type.and(aged), JExpr.Type.and(located));
 * JExpr.Type.compile(person); // => "Named & Aged & Located"
 * JExpr.Type.compile(JExpr.Type.and(named, aged)); // => "Named & Aged"
 * ```
 */
export const and: {
  (that: Type): (self: Type) => Defs.IntersectionType;
  (self: Type, that: Type): Defs.IntersectionType;
} = dual(2, (self: Type, that: Type): Defs.IntersectionType => ({
  _tag: "Intersection",
  members: [...intersectionMembers(self), ...intersectionMembers(that)],
}));

/**
 * Compiles a type into J-Expr type syntax.
 *
 * Parentheses preserve operator precedence and nested union/intersection membership. The printer omits redundant groups. HashQL gives union higher precedence than intersection. A single-member union or intersection compiles as its member. Empty structs use `(:)`, empty tuples use `()`, and single-member tuples retain a trailing comma.
 *
 * @example <caption>Compile a nested type.</caption>
 * ```ts
 * import { Option } from "effect";
 * import { JExpr } from "@local/hashql";
 *
 * const integer = Option.getOrThrow(JExpr.Type.reference("Integer"));
 * const string = Option.getOrThrow(JExpr.Type.reference("String"));
 * const list = Option.getOrThrow(
 *   JExpr.Type.reference("List", JExpr.Type.union(integer, string)),
 * );
 * JExpr.Type.compile(list); // => "List<Integer | String>"
 * ```
 */
export const compile: (type: Type) => Identifier = compileType;

/**
 * Encodes a type in an expression position, such as a type definition or closure parameter.
 *
 * Compound types use constructors here. Only annotation positions accept their type-syntax strings.
 */
export const toExpression: (type: Type) => ExpressionType = Defs.Type.match({
  Infer: () => "_",
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
