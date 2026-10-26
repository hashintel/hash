/**
 * Structural shorthand for HashQL types and values.
 *
 * {@link type} normalizes host constructors, tuples and records into type syntax. {@link value} accepts a structural value only when its semantic descriptor matches the requested type. Both operations retain nested type information, and value construction combines input requirements from every possible host-side alternative.
 *
 * @module
 */
import {
  Array,
  Predicate,
  Record,
  Result,
  Struct,
  Tuple,
  flow,
  pipe,
} from "effect";

import * as JExpr from "../JExpr/index.js";
import * as Syntax from "../JExpr/Type/index.js";
import * as Expression from "./Expression.js";
import * as ProgramError from "./ProgramError.js";
import * as TypeExpression from "./TypeExpression.js";

import type * as Relocation from "../internal/relocation.js";
import type * as Type from "../Type.js";
import type * as Inputs from "./Inputs.js";

interface Fields extends Record.ReadonlyRecord<string, Definition> {}

/**
 * A type handle, a supported host primitive constructor, a tuple of definitions or a record of field definitions.
 *
 * `BigInt`, `Number`, `String` and `Boolean` denote their HashQL primitive types. Arrays denote tuples, not lists. Use a declared generic type constructor for lists and dictionaries. See {@link type} for normalization.
 */
export type Definition =
  | TypeExpression.TypeExpression.Any
  | BigIntConstructor
  | NumberConstructor
  | StringConstructor
  | BooleanConstructor
  | readonly Definition[]
  | Fields;

/**
 * Resolves shorthand to its semantic descriptor without widening its fields.
 *
 * This conditional distributes over host alternatives: a choice between two definitions retains both possible descriptors. Inputs outside the shorthand language resolve to `never`, allowing the same operation to serve Effect's type-level mapping functions.
 */
export type TypeOf<D> =
  D extends TypeExpression.TypeExpression<infer T>
    ? T
    : D extends BigIntConstructor
      ? Type.PrimitiveInteger
      : D extends NumberConstructor
        ? Type.PrimitiveNumber
        : D extends StringConstructor
          ? Type.PrimitiveString
          : D extends BooleanConstructor
            ? Type.PrimitiveBoolean
            : D extends readonly Definition[]
              ? {
                  readonly _tag: "Tuple";
                  readonly fields: { readonly [K in keyof D]: TypeOf<D[K]> };
                }
              : D extends Fields
                ? Type.Struct<{ readonly [K in keyof D]: TypeOf<D[K]> }>
                : never;

type TupleValues<T extends readonly Type.Any[]> = {
  readonly [K in keyof T]: Value<T[K]>;
};

/**
 * A value accepted for descriptor `T`, including recursive record and tuple shorthand.
 *
 * Nominal descriptors require a matching handle rather than their underlying host representation. Lists and dictionaries likewise require expressions. A host array always denotes a tuple.
 */
export type Value<T extends Type.Any> =
  | Expression.Value<T>
  | (T extends Type.Struct<infer F>
      ? { readonly [K in keyof F]: Value<F[K]> }
      : T extends Type.Tuple.Any
        ? TupleValues<T["fields"]>
        : never);

export declare namespace Value {
  /** Expressions and host primitives, recursively nested in tuples or field records. */
  export type Any = Expression.Value.Any | readonly Any[] | FieldValues;
}

interface FieldValues extends Record.ReadonlyRecord<string, Value.Any> {}

/**
 * Retains the input requirements of every possible host value.
 *
 * A TypeScript union represents a host-side choice between values. Both arms may have the same HashQL type while carrying different inputs. Construction can choose either arm, so the resulting expression must require the inputs of both arms. Tuple and record recursion also includes inputs hidden inside structural values.
 */
export type Requirements<V extends Value.Any> = Inputs.Conservative<
  RequirementAlternatives<V>
>;

type RequirementAlternatives<V extends Value.Any> =
  V extends Expression.Value.Any
    ? Expression.Inputs<V>
    : V extends readonly [
          infer H extends Value.Any,
          ...infer T extends readonly Value.Any[],
        ]
      ? Inputs.Conservative<Inputs.Merge<Requirements<H>, Requirements<T>>>
      : V extends readonly (infer M extends Value.Any)[]
        ? [M] extends [never]
          ? Inputs.Empty
          : Inputs.Conservative<Requirements<M>>
        : V extends FieldValues
          ? [keyof V] extends [never]
            ? Inputs.Empty
            : Inputs.Conservative<
                { [K in keyof V]: Requirements<V[K]> }[keyof V]
              >
          : Inputs.Empty;

/**
 * Recognizes recursive type shorthand without confusing primitive values with constructors.
 *
 * This dispatch check examines enumerable own string-keyed values and the SDK type marker. It does not validate field names or stored type syntax. Empty records and arrays qualify. Host objects must be acyclic.
 */
// oxlint-disable-next-line typescript/no-restricted-types -- overload dispatch must distinguish arbitrary host arguments before normalization
export const isDefinition = (value: unknown): value is Definition => {
  if (TypeExpression.isExport(value)) {
    return Predicate.hasProperty(value, "syntax");
  }

  if (
    value === BigInt ||
    value === String ||
    value === Number ||
    value === Boolean
  ) {
    return true;
  }

  if (!Predicate.isObjectOrArray(value) || Predicate.isFunction(value)) {
    return false;
  }

  return Object.values(value).every(isDefinition);
};

/**
 * Recognizes structural value arguments, including expressions with type capabilities too.
 *
 * This dispatch check traverses enumerable own string-keyed values without validating field names or stored syntax. Non-finite numbers pass this check too. Validation belongs to {@link value} or {@link toJExpr}. Host objects must be acyclic.
 */
// oxlint-disable-next-line typescript/no-restricted-types -- overload dispatch must distinguish arbitrary host arguments before normalization
export const isValue = (value: unknown): value is Value.Any => {
  if (Expression.isExpression(value)) {
    return true;
  }

  if (TypeExpression.isExport(value)) {
    return false;
  }

  const type = typeof value;
  if (
    value === null ||
    type === "string" ||
    type === "number" ||
    type === "bigint" ||
    type === "boolean"
  ) {
    return true;
  }

  if (!Predicate.isObjectOrArray(value) || Predicate.isFunction(value)) {
    return false;
  }

  return Object.values(value).every(isValue);
};

const primitiveSyntax = (
  name: "Integer" | "Number" | "String" | "Boolean",
): Syntax.Type =>
  Syntax.Reference.make({
    path: JExpr.Path.decodeResult(`::kernel::type::${name}`).pipe(
      Result.getOrThrow,
    ),
  });

const primitives = {
  integer: primitiveSyntax("Integer"),
  number: primitiveSyntax("Number"),
  string: primitiveSyntax("String"),
  boolean: primitiveSyntax("Boolean"),
};

const typeSyntax = (
  definition: Definition,
): Result.Result<Syntax.Type, ProgramError.Construction> => {
  if (TypeExpression.isExport(definition)) {
    if (Predicate.hasProperty(definition, "syntax")) {
      return definition.syntax;
    }

    return Result.fail(
      ProgramError.Construction.unspecializedTypeConstructor(),
    );
  }

  if (Predicate.isFunction(definition)) {
    switch (definition) {
      case BigInt: {
        return Result.succeed(primitives.integer);
      }
      case Number: {
        return Result.succeed(primitives.number);
      }
      case String: {
        return Result.succeed(primitives.string);
      }
      case Boolean: {
        return Result.succeed(primitives.boolean);
      }
      default: {
        return Result.fail(
          ProgramError.Construction.unsupportedTypeConstructor(definition.name),
        );
      }
    }
  }

  if (Array.isArray<Definition>(definition)) {
    return pipe(
      definition,
      Array.map(typeSyntax),
      Result.all,
      Result.map((members) => ({
        _tag: "Tuple",
        members,
      })),
    );
  }

  return pipe(
    definition,
    Record.toEntries,
    Array.map(([name, member]) =>
      Result.all({
        name: pipe(
          JExpr.Ident.decodeResult(name),
          Result.mapError((cause) =>
            ProgramError.Construction.invalidBindingName(name, cause),
          ),
        ),
        member: typeSyntax(member),
      }),
    ),
    Result.all,
    Result.map(Array.map(({ name, member }) => [name, member] as const)),
    Result.map((members) => ({
      _tag: "Struct",
      members,
    })),
  );
};

/**
 * Constructs a type expression from primitive, tuple and record shorthand.
 *
 * The descriptor retains each tuple position and record field. Runtime records contribute enumerable own string keys. Invalid field names and failed nested type handles remain construction failures in the returned handle's `syntax` Result. The resulting type description provides no runtime validator for host values.
 *
 * @example <caption>Describe a record with a nested tuple.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr, Program } from "@local/hashql";
 * import { Result } from "effect";
 *
 * const { Expression, Structural } = Program;
 * const account = Structural.type({ name: String, location: [Number, Number] });
 * const input = Expression.input("account", account);
 * assert.equal(
 *   JExpr.compile(Result.getOrThrow(Expression.toJExpr(input))),
 *   '["::kernel::special_form::input","account",{"#struct":{"name":"::kernel::type::String","location":{"#tuple":["::kernel::type::Number","::kernel::type::Number"]}}}]',
 * );
 * ```
 */
export const type = <const D extends Definition>(
  definition: D,
): TypeExpression.TypeExpression<TypeOf<D>> =>
  pipe(definition, typeSyntax, TypeExpression.fromResult<TypeOf<D>>);

/** Applies normalization independently at every position instead of collapsing the tuple to an element union. */
interface Normalize extends Struct.Lambda {
  readonly "~lambda.out": TypeExpression.TypeExpression<
    TypeOf<this["~lambda.in"]>
  >;

  <const D extends Definition>(
    definition: D,
  ): TypeExpression.TypeExpression<TypeOf<D>>;
}

const normalize = Tuple.map(Struct.lambda<Normalize>(type));

type ArgumentTypes<A extends readonly Definition[]> = {
  readonly [K in keyof A]: TypeOf<A[K]>;
};

/** A named generic type accepting the same shorthand as a local alias. */
export interface Constructor<F extends Type.TypeConstructor>
  extends TypeExpression.Constructor.Any {
  readonly [Relocation.Relocate]: Relocation.Relocatable<
    Constructor<F>
  >[typeof Relocation.Relocate];

  <const A extends readonly Definition[]>(
    ...definitions: A & { readonly length: F["arity"] }
  ): TypeExpression.TypeExpression<Type.Apply<F, ArgumentTypes<A>>>;
}

/**
 * Adapts a generic type declaration to accept {@link Definition} shorthand at each argument position.
 *
 * The original constructor still checks arity and retains failed type arguments. Relocation rebuilds the adapter around the new declaration path. Apply the returned constructor before using it as a type.
 */
export const constructor = <F extends Type.TypeConstructor>(
  declaration: TypeExpression.Constructor<F>,
): Constructor<F> =>
  TypeExpression.adaptConstructor(
    declaration,
    (source) =>
      <const A extends readonly Definition[]>(
        ...definitions: A & { readonly length: F["arity"] }
      ): TypeExpression.TypeExpression<Type.Apply<F, ArgumentTypes<A>>> =>
        source<ArgumentTypes<A>>(...normalize<A>(definitions)),
  );

const valueSyntax = (
  value: Value.Any,
): Result.Result<JExpr.Expression, ProgramError.Construction> => {
  if (
    Expression.isExpression(value) ||
    value === null ||
    typeof value !== "object"
  ) {
    return Expression.toJExpr(value);
  }

  if (Array.isArray<Value.Any>(value)) {
    return pipe(
      value,
      Array.map(valueSyntax),
      Result.all,
      Result.map((members) => JExpr.tuple(...members)),
    );
  }

  return pipe(
    value,
    Record.toEntries,
    Array.map(([name, member]) =>
      pipe(
        member,
        valueSyntax,
        Result.map((syntax) => [name, syntax] as const),
      ),
    ),
    Result.all,
    Result.map(flow(Record.fromEntries, JExpr.struct)),
  );
};

type ValueTypes<V extends readonly Value.Any[]> = {
  readonly [K in keyof V]: ValueType<V[K]>;
};

/** The semantic descriptor of a structural host value, without implicit widening. */
export type ValueType<V extends Value.Any> = V extends Expression.Value.Any
  ? Expression.TypeOf<V>
  : V extends readonly Value.Any[]
    ? {
        readonly _tag: "Tuple";
        readonly fields: ValueTypes<V>;
      }
    : V extends FieldValues
      ? Type.Struct<{ readonly [K in keyof V]: ValueType<V[K]> }>
      : never;

/** Accepts `V` only when its inferred structural descriptor and `T` are mutually assignable, preventing extra fields from disappearing from the reported type. */
export type Exact<T extends Type.Any, V extends Value.Any> = [T] extends [
  ValueType<V>,
]
  ? [ValueType<V>] extends [T]
    ? V
    : never
  : never;

/**
 * Constructs a value whose inferred structural descriptor matches the requested type.
 *
 * Supply the semantic descriptor first, then a value with matching fields and tuple positions. This exactness is a TypeScript constraint, not runtime semantic validation. Syntax validation returns failures through the resulting expression. Every nested expression contributes input requirements, including every alternative of a host-side union.
 *
 * Arrays encode tuples. Records encode enumerable own string keys; inherited, non-enumerable and symbol properties are not emitted. Host objects must be acyclic.
 *
 * @example <caption>Construct a typed record from host values.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { Program } from "@local/hashql";
 * import type { Type } from "@local/hashql";
 * import { Result } from "effect";
 *
 * const { Expression, Structural } = Program;
 * type Account = Type.Struct<{
 *   readonly name: Type.PrimitiveString;
 *   readonly active: Type.PrimitiveBoolean;
 * }>;
 * const account = Structural.value<Account>()({ name: "Ada", active: true });
 * assert.deepEqual(Result.getOrThrow(Expression.toJExpr(account)), {
 *   "#struct": { name: { "#literal": "Ada" }, active: { "#literal": true } },
 * });
 * ```
 */
export const value =
  <T extends Type.Any>() =>
  <const V extends Value<T> & Value.Any>(
    input: V & Exact<T, V>,
  ): Expression.Expression<T, Requirements<V>> =>
    pipe(
      input,
      valueSyntax,
      Result.flatMap(flow(Expression.fromJExpr, Expression.toNode)),
      Expression.fromResult<T, Requirements<V>>,
    );

/**
 * Converts structural host values to validated J-Expr syntax without assigning a semantic descriptor.
 *
 * Arrays encode tuples and records encode enumerable own string keys, as in {@link value}. Invalid nested syntax returns a construction failure. Existing handles contribute their stored failures unchanged. Use {@link value} when the result needs a typed expression handle.
 */
export const toJExpr = (
  value: Value.Any,
): Result.Result<JExpr.Expression, ProgramError.Construction> =>
  pipe(
    value,
    valueSyntax,
    Result.flatMap(flow(Expression.fromJExpr, Expression.toJExpr)),
  );
