/**
 * Syntax conversion shared by structural constructors.
 *
 * The public signatures retain semantic descriptors and input requirements. These operations lower their statically checked values to J-Expr while retaining construction failures.
 *
 * @module
 */
import {
  Array,
  MutableHashSet,
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
import * as Expression from "../Program/Expression.js";
import * as ProgramError from "../Program/ProgramError.js";
import * as TypeExpression from "../Program/TypeExpression.js";
import * as Overflow from "./overflow.js";
import { Relocate } from "./relocation.js";

import type * as Structural from "../Program/Structural.js";
import type * as Type from "../Type.js";

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

const collectionPaths = Record.map(
  { List: "::kernel::type::List", Dict: "::kernel::type::Dict" },
  (path) => pipe(path, JExpr.Path.decodeResult, Result.getOrThrow),
);

// Collection arguments come from definitions whose syntax nothing has checked. Validating the path here turns an invalid argument into a construction failure instead of a throw.
const makePath = Overflow.makeResult(JExpr.Path.Schema);

/**
 * Checks that no two fields share a name.
 *
 * Fields compare by decoded identifier, so `+` and `` `+` `` are one field. Comparing names reports the later spelling before the struct reaches syntax.
 */
const distinct = <
  F extends { readonly key: string; readonly name: JExpr.Ident.Ident },
>(
  fields: readonly F[],
): Result.Result<readonly F[], ProgramError.Construction> => {
  const seen = MutableHashSet.empty<JExpr.Ident.Ident>();
  for (const { key, name } of fields) {
    if (MutableHashSet.has(seen, name)) {
      return Result.fail(ProgramError.Construction.duplicateStructField(key));
    }

    MutableHashSet.add(seen, name);
  }

  return Result.succeed(fields);
};

/**
 * Tests the type marker first, because a type expression is a plain object and a type constructor is a function.
 *
 * The marker is a string key, so a parsed JSON record can carry it. Only a handle the SDK built also carries the relocation symbol. A marker record without that symbol takes the record branch, and its marker key fails there as a field name.
 */
export const typeSyntax = (
  definition: Structural.Definition,
): Result.Result<Syntax.Type, ProgramError.Construction> => {
  if (
    TypeExpression.isExport(definition) &&
    Predicate.hasProperty(definition, Relocate)
  ) {
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

  if (Array.isArray<Structural.Definition>(definition)) {
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
    Array.map(([key, member]) =>
      Result.all({
        key: Result.succeed(key),
        name: pipe(
          key,
          JExpr.Ident.decodeResult,
          Result.mapError((cause) =>
            ProgramError.Construction.invalidBindingName(key, cause),
          ),
        ),
        member: typeSyntax(member),
      }),
    ),
    Result.all,
    Result.flatMap(distinct),
    Result.map((fields) => ({
      _tag: "Struct",
      members: Array.map(fields, ({ name, member }) => [name, member] as const),
    })),
  );
};

/** Tests for an expression first, because a predicate is a plain object that carries the expression markers rather than fields. */
export const valueSyntax = (
  value: Structural.Value.Any,
): Result.Result<JExpr.Expression, ProgramError.Construction> => {
  if (
    Expression.isExpression(value) ||
    value === null ||
    typeof value !== "object"
  ) {
    return Expression.toJExpr(value);
  }

  if (Array.isArray<Structural.Value.Any>(value)) {
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
    Array.map(([key, member]) =>
      Result.all({
        key: Result.succeed(key),
        name: pipe(
          key,
          JExpr.Ident.decodeResult,
          Result.mapError((cause) =>
            ProgramError.Construction.invalidExpression(cause),
          ),
        ),
        syntax: valueSyntax(member),
      }),
    ),
    Result.all,
    Result.flatMap(distinct),
    Result.map(
      flow(
        Array.map(({ key, syntax }) => [key, syntax] as const),
        Record.fromEntries,
        JExpr.struct,
      ),
    ),
  );
};

/** Validates assembled syntax before attaching its statically established descriptor and requirements. */
export const fromSyntax = <T extends Type.Any, I>(
  syntax: Result.Result<JExpr.Expression, ProgramError.Construction>,
): Expression.Expression<T, I> =>
  pipe(
    syntax,
    Result.flatMap(flow(Expression.fromJExpr, Expression.toNode)),
    Expression.fromResult<T, I>,
  );

/** Checks every element without hiding extra fields in a structural value. */
export type ExactValues<
  T extends Type.Any,
  V extends readonly Structural.Value.Any[],
> = {
  readonly [K in keyof V]: Structural.Value.Exact<T, V[K]>;
};

/** Converts checked members to syntax without reinterpreting their descriptors. */
export const membersSyntax = (
  members: readonly Structural.Value.Any[],
): Result.Result<readonly JExpr.Expression[], ProgramError.Construction> =>
  Result.all(Array.map(members, valueSyntax));

/** Applies a fixed kernel collection type to successfully normalized arguments. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructs a collection type from its name and arguments
export const collectionType = (
  name: "List" | "Dict",
  definitions: readonly Structural.Definition[],
): Result.Result<Syntax.Type, ProgramError.Construction> =>
  pipe(
    definitions,
    Array.map(typeSyntax),
    Result.all,
    Result.flatMap((arguments_) => {
      const path = collectionPaths[name];
      return pipe(
        makePath({
          rooted: path.rooted,
          segments: Array.modifyLastNonEmpty(path.segments, (segment) => ({
            name: segment.name,
            arguments: [
              ...segment.arguments,
              ...Array.map(arguments_, (bound) => ({
                _tag: "GenericArgument" as const,
                bound,
              })),
            ],
          })),
        }),
        Result.mapBoth({
          onFailure: (cause) =>
            ProgramError.Construction.invalidExpression(cause),
          onSuccess: (applied): Syntax.Type => ({
            _tag: "Reference",
            path: applied,
          }),
        }),
      );
    }),
  );

/** String-key records or explicit key/value pairs accepted by a dictionary. */
export type DictionaryValues =
  | readonly (readonly [Structural.Value.Any, Structural.Value.Any])[]
  | Record.ReadonlyRecord<string, Structural.Value.Any>;

/** Keeps key and value checks separate for each entry. */
type ExactEntry<
  K extends Type.Any,
  V extends Type.Any,
  E,
> = E extends readonly [
  infer Key extends Structural.Value.Any,
  infer Member extends Structural.Value.Any,
]
  ? readonly [Structural.Value.Exact<K, Key>, Structural.Value.Exact<V, Member>]
  : never;

/** Preserves exact structural descriptors for both dictionary keys and values. */
export type ExactEntries<
  K extends Type.Any,
  V extends Type.Any,
  E,
> = E extends readonly (readonly [Structural.Value.Any, Structural.Value.Any])[]
  ? { readonly [P in keyof E]: ExactEntry<K, V, E[P]> }
  : E extends Record.ReadonlyRecord<string, Structural.Value.Any>
    ? Structural.Value.Exact<K, string> extends never
      ? never
      : { readonly [P in keyof E]: Structural.Value.Exact<V, E[P]> }
    : never;

interface ValueSyntaxMapping extends Struct.Lambda {
  readonly "~lambda.out": ReturnType<typeof valueSyntax>;
}

const valueSyntaxLambda = Struct.lambda<
  typeof valueSyntax & ValueSyntaxMapping
>(valueSyntax);

/** Normalizes record keys as literals and preserves explicit expression keys. */
export const dictionarySyntax = (
  entries: DictionaryValues,
): Result.Result<ReturnType<typeof JExpr.dict>, ProgramError.Construction> => {
  if (!Array.isArray<DictionaryValues>(entries)) {
    return dictionarySyntax(Record.toEntries(entries));
  }

  return pipe(
    entries,
    Array.map(flow(Tuple.map(valueSyntaxLambda), Result.all)),
    Result.all,
    Result.map(JExpr.dict),
  );
};
