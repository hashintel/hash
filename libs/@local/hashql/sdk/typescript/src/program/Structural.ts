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

import * as JExpr from "../jexpr/index.js";
import * as Syntax from "../jexpr/type/index.js";
import * as Expression from "./Expression.js";
import * as ProgramError from "./ProgramError.js";
import * as TypeExpression from "./TypeExpression.js";

import type { Relocatable, Relocate } from "../internal/relocation.js";
import type * as Type from "../type/index.js";
import type * as Input from "./Inputs.js";
import type { ReadonlyRecord } from "effect/Record";

interface Fields extends ReadonlyRecord<string, Definition> {}

/** Runtime type syntax, host primitive constructors, or structural shorthand. */
export type Definition =
  | TypeExpression.Any
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

/** Structural host values do not implicitly unwrap nominal types. */
export type Value<T extends Type.Any> =
  | Expression.Value<T>
  | (T extends Type.Struct<infer F>
      ? { readonly [K in keyof F]: Value<F[K]> }
      : T extends Type.Tuple.Any
        ? TupleValues<T["fields"]>
        : never);

interface FieldValues extends ReadonlyRecord<string, AnyValue> {}

export type AnyValue = Expression.AnyValue | readonly AnyValue[] | FieldValues;

/**
 * Retains the input requirements of every possible host value.
 *
 * A TypeScript union represents a host-side choice between values. Both arms may have the same HashQL type while carrying different inputs. Construction can choose either arm, so the resulting expression must require the inputs of both arms. Tuple and record recursion also includes inputs hidden inside structural values.
 */
export type Requirements<V extends AnyValue> = Input.Conservative<
  RequirementAlternatives<V>
>;

type RequirementAlternatives<V extends AnyValue> = V extends Expression.AnyValue
  ? Expression.Inputs<V>
  : V extends readonly [
        infer H extends AnyValue,
        ...infer T extends readonly AnyValue[],
      ]
    ? Input.Conservative<Input.Merge<Requirements<H>, Requirements<T>>>
    : V extends readonly (infer M extends AnyValue)[]
      ? [M] extends [never]
        ? Input.Empty
        : Input.Conservative<Requirements<M>>
      : V extends FieldValues
        ? [keyof V] extends [never]
          ? Input.Empty
          : Input.Conservative<{ [K in keyof V]: Requirements<V[K]> }[keyof V]>
        : Input.Empty;

/** Recognizes recursive type shorthand without confusing primitive values with constructors. */
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

/** Recognizes structural value arguments, including expressions with type capabilities too. */
// oxlint-disable-next-line typescript/no-restricted-types -- overload dispatch must distinguish arbitrary host arguments before normalization
export const isValue = (value: unknown): value is AnyValue => {
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
    generics: [],
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
    Result.map((fields) => ({
      _tag: "Struct",
      members: fields.map(({ name, member }) => [name, member] as const),
    })),
  );
};

/** Normalizes shorthand while retaining invalid names in the construction result. */
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
  extends TypeExpression.AnyConstructor {
  readonly [Relocate]: Relocatable<Constructor<F>>[typeof Relocate];

  <const A extends readonly Definition[]>(
    ...definitions: A & { readonly length: F["arity"] }
  ): TypeExpression.TypeExpression<Type.Apply<F, ArgumentTypes<A>>>;
}

/** Gives an existing generic declaration the same shorthand normalization as local aliases. */
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
  value: AnyValue,
): Result.Result<JExpr.Expression, ProgramError.Construction> => {
  if (
    Expression.isExpression(value) ||
    value === null ||
    typeof value !== "object"
  ) {
    return Expression.toJExpr(value);
  }

  if (Array.isArray<AnyValue>(value)) {
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

type ValueTypes<V extends readonly AnyValue[]> = {
  readonly [K in keyof V]: ValueType<V[K]>;
};

/** The semantic descriptor of a structural host value, without implicit widening. */
export type ValueType<V extends AnyValue> = V extends Expression.AnyValue
  ? Expression.TypeOf<V>
  : V extends readonly AnyValue[]
    ? {
        readonly _tag: "Tuple";
        readonly fields: ValueTypes<V>;
      }
    : V extends FieldValues
      ? Type.Struct<{ readonly [K in keyof V]: ValueType<V[K]> }>
      : never;

/** Checking only the value against T would discard additional fields from the reported type. */
export type Exact<T extends Type.Any, V extends AnyValue> = [T] extends [
  ValueType<V>,
]
  ? [ValueType<V>] extends [T]
    ? V
    : never
  : never;

/** Encodes a structural value whose descriptor exactly matches the caller's requested type. */
export const value =
  <T extends Type.Any>() =>
  <const V extends Value<T> & AnyValue>(
    input: V & Exact<T, V>,
  ): Expression.Expression<T, Requirements<V>> =>
    pipe(
      input,
      valueSyntax,
      Result.flatMap(flow(Expression.fromJExpr, Expression.toNode)),
      Expression.fromResult<T, Requirements<V>>,
    );

/** Internal syntax conversion shared by nominal constructors. */
export const toJExpr = (
  value: AnyValue,
): Result.Result<JExpr.Expression, ProgramError.Construction> =>
  pipe(
    value,
    valueSyntax,
    Result.flatMap(flow(Expression.fromJExpr, Expression.toJExpr)),
  );
