/**
 * Syntax conversion shared by structural constructors.
 *
 * The public signatures retain semantic descriptors and input requirements. These operations lower their statically checked values to AST nodes while retaining construction failures.
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
import * as AST from "../Program/AST/index.js";
import * as Expression from "../Program/Expression.js";
import * as ProgramError from "../Program/ProgramError.js";
import * as TypeExpression from "../Program/TypeExpression.js";
import * as Overflow from "./overflow.js";
import { Relocate } from "./relocation.js";

import type * as Structural from "../Program/Structural.js";
import type * as Type from "../Type.js";

const primitiveSyntax = (
  name: "Integer" | "Number" | "String" | "Boolean",
): AST.TypeSyntax => ({
  syntax: JExpr.Type.Reference.make({
    path: JExpr.Path.decodeResult(`::kernel::type::${name}`).pipe(
      Result.getOrThrow,
    ),
  }),
  references: [],
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

interface Field {
  readonly key: string;
  readonly name: JExpr.Ident.Ident;
  readonly member: AST.TypeSyntax;
}

// `+` and `` `+` `` decode to the same name, and a struct holds each name once. Comparing decoded names reports the later spelling before the struct reaches syntax the schema refuses.
const distinctFields = (
  fields: readonly Field[],
): Result.Result<AST.TypeSyntax, ProgramError.Construction> => {
  const seen = MutableHashSet.empty<JExpr.Ident.Ident>();
  for (const { key, name } of fields) {
    if (MutableHashSet.has(seen, name)) {
      return Result.fail(ProgramError.Construction.duplicateStructField(key));
    }

    MutableHashSet.add(seen, name);
  }

  return Result.succeed({
    syntax: {
      _tag: "Struct",
      members: Array.map(
        fields,
        ({ name, member }) => [name, member.syntax] as const,
      ),
    },
    references: Array.flatMap(fields, ({ member }) => member.references),
  });
};

/**
 * Tests the type marker first, because a type expression is a plain object and a type constructor is a function.
 *
 * The marker is a string key, so a parsed JSON record can carry it. Only a handle the SDK built also carries the relocation symbol, so a marker record without one falls through to the record branch, where its marker key fails as a field name.
 */
export const typeSyntax = (
  definition: Structural.Definition,
): Result.Result<AST.TypeSyntax, ProgramError.Construction> => {
  if (
    TypeExpression.isExport(definition) &&
    Predicate.hasProperty(definition, Relocate)
  ) {
    if (Predicate.hasProperty(definition, "syntax")) {
      return Result.map(definition.syntax, (syntax) => ({
        syntax,
        references: AST.referencesOf(definition),
      }));
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
        syntax: {
          _tag: "Tuple",
          members: Array.map(members, ({ syntax }) => syntax),
        },
        references: Array.flatMap(members, ({ references }) => references),
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
    Result.flatMap(distinctFields),
  );
};

/** Builds a type handle that keeps the ids of the Draft type bindings its syntax names, for the Draft's check where the handle is used. */
export const typeHandle = <T extends Type.Any>(
  result: Result.Result<AST.TypeSyntax, ProgramError.Construction>,
): TypeExpression.TypeExpression<T> =>
  Object.assign(
    TypeExpression.fromResult<T>(Result.map(result, ({ syntax }) => syntax)),
    {
      [AST.References]: pipe(
        result,
        Result.map(({ references }) => references),
        Result.getOrElse((): readonly AST.ReferenceId[] => []),
      ),
    },
  );

/** Tests for an expression first, because a predicate is a plain object that carries the expression markers rather than fields. */
export const valueNode = (
  value: Structural.Value.Any,
): Result.Result<AST.Node, ProgramError.Construction> => {
  if (
    Expression.isExpression(value) ||
    value === null ||
    typeof value !== "object"
  ) {
    return Expression.toNode(value);
  }

  if (Array.isArray<Structural.Value.Any>(value)) {
    return pipe(
      value,
      Array.map(valueNode),
      Result.all,
      Result.map((members) => new AST.Tuple(members)),
    );
  }

  return pipe(
    value,
    Record.toEntries,
    Array.map(([name, member]) =>
      pipe(
        member,
        valueNode,
        Result.map((node) => [name, node] as const),
      ),
    ),
    Result.all,
    Result.map((fields) => new AST.Struct(fields)),
  );
};

/** Validates an assembled node before attaching its statically established descriptor and requirements. */
export const fromNode = <T extends Type.Any, I>(
  node: Result.Result<AST.Node, ProgramError.Construction>,
): Expression.Expression<T, I> =>
  pipe(node, Result.flatMap(AST.validate), Expression.fromResult<T, I>);

/** Checks every element without hiding extra fields in a structural value. */
export type ExactValues<
  T extends Type.Any,
  V extends readonly Structural.Value.Any[],
> = {
  readonly [K in keyof V]: Structural.Value.Exact<T, V[K]>;
};

/** Converts checked members to nodes without reinterpreting their descriptors. */
export const memberNodes = (
  members: readonly Structural.Value.Any[],
): Result.Result<readonly AST.Node[], ProgramError.Construction> =>
  Result.all(Array.map(members, valueNode));

/** Applies a fixed kernel collection type to successfully normalized arguments. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructs a collection type from its name and arguments
export const collectionType = (
  name: "List" | "Dict",
  definitions: readonly Structural.Definition[],
): Result.Result<AST.TypeSyntax, ProgramError.Construction> =>
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
              ...Array.map(arguments_, ({ syntax }) => ({
                _tag: "GenericArgument" as const,
                bound: syntax,
              })),
            ],
          })),
        }),
        Result.mapBoth({
          onFailure: (cause) =>
            ProgramError.Construction.invalidExpression(cause),
          onSuccess: (applied): AST.TypeSyntax => ({
            syntax: { _tag: "Reference", path: applied },
            references: Array.flatMap(
              arguments_,
              ({ references }) => references,
            ),
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

interface ValueNodeMapping extends Struct.Lambda {
  readonly "~lambda.out": ReturnType<typeof valueNode>;
}

const valueNodeLambda = Struct.lambda<typeof valueNode & ValueNodeMapping>(
  valueNode,
);

/** Normalizes record keys as literals and preserves explicit expression keys. */
export const dictionaryEntries = (
  entries: DictionaryValues,
): Result.Result<
  readonly (readonly [AST.Node, AST.Node])[],
  ProgramError.Construction
> => {
  if (!Array.isArray<DictionaryValues>(entries)) {
    return dictionaryEntries(Record.toEntries(entries));
  }

  return pipe(
    entries,
    Array.map(flow(Tuple.map(valueNodeLambda), Result.all)),
    Result.all,
  );
};
