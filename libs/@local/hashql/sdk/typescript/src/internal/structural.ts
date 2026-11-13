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
  Option,
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
import * as TAST from "../Program/TAST/index.js";
import * as TypeExpression from "../Program/TypeExpression.js";
import { Relocate } from "./relocation.js";

import type * as Structural from "../Program/Structural.js";
import type * as Type from "../Type.js";

const kernelType = (
  name: "Integer" | "Number" | "String" | "Boolean",
): TAST.Reference =>
  new TAST.Reference(
    Result.getOrThrow(JExpr.Path.decodeResult(`::kernel::type::${name}`)),
    [],
  );

const primitives = {
  integer: kernelType("Integer"),
  number: kernelType("Number"),
  string: kernelType("String"),
  boolean: kernelType("Boolean"),
};

const collectionPaths = Record.map(
  { List: "::kernel::type::List", Dict: "::kernel::type::Dict" },
  (path) => pipe(path, JExpr.Path.decodeResult, Result.getOrThrow),
);

/**
 * Checks that no two fields share a name.
 *
 * Fields compare by {@link JExpr.Ident.name}, so `+` and `` `+` ``, or the precomposed `"\u00E9"` and the combining `"e\u0301"`, are one field. Comparing names reports the later spelling before the struct reaches syntax.
 */
const distinct = <
  F extends { readonly key: string; readonly name: JExpr.Ident.Ident },
>(
  fields: readonly F[],
): Result.Result<readonly F[], ProgramError.Construction> => {
  const seen = MutableHashSet.empty<JExpr.Ident.Name>();
  for (const { key, name } of fields) {
    const interned = JExpr.Ident.name(name);
    if (MutableHashSet.has(seen, interned)) {
      return Result.fail(ProgramError.Construction.duplicateStructField(key));
    }

    MutableHashSet.add(seen, interned);
  }

  return Result.succeed(fields);
};

/**
 * Tests the type marker first, because a type expression is a plain object and a type constructor is a function.
 *
 * The marker is a string key, so a parsed JSON record can carry it. Only a handle the SDK built also carries the relocation symbol. A marker record without that symbol takes the record branch, and its marker key fails there as a field name.
 */
export const typeNode = (
  definition: Structural.Definition,
): Result.Result<TAST.TypeNode.Any, ProgramError.Construction> => {
  if (
    TypeExpression.isExport(definition) &&
    Predicate.hasProperty(definition, Relocate)
  ) {
    if (Predicate.hasProperty(definition, TAST.Node)) {
      return definition[TAST.Node];
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
      Array.map(typeNode),
      Result.all,
      Result.map((members) => new TAST.Tuple(members)),
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
        type: typeNode(member),
      }),
    ),
    Result.all,
    Result.flatMap(distinct),
    Result.map(
      (fields) =>
        new TAST.Struct(Array.map(fields, ({ name, type }) => [name, type])),
    ),
  );
};

/** Lowers an optional annotation, or nothing when the caller passes no `type`. */
export const annotation = (
  type: Structural.Definition | undefined,
): Result.Result<TAST.TypeNode.Any | undefined, ProgramError.Construction> =>
  pipe(
    Result.transposeMapOption(Option.fromUndefinedOr(type), typeNode),
    Result.map(Option.getOrUndefined),
  );

/** Lowers a tuple's members, with the type that annotates it when there is one. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- lowers the members and the annotation of one tuple
export const tupleNode = (
  members: readonly Structural.Value.Any[],
  type?: TAST.TypeNode.Any,
): Result.Result<AST.Node.Any, ProgramError.Construction> =>
  pipe(
    members,
    // oxlint-disable-next-line eslint/no-use-before-define -- a tuple's members and a value's tuple are mutually recursive
    Array.map(valueNode),
    Result.all,
    Result.map((nodes) => new AST.Tuple(nodes, type)),
  );

/** Lowers a struct's fields, with the type that annotates it when there is one. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- lowers the fields and the annotation of one struct
export const structNode = (
  fields: Record.ReadonlyRecord<string, Structural.Value.Any>,
  type?: TAST.TypeNode.Any,
): Result.Result<AST.Node.Any, ProgramError.Construction> =>
  pipe(
    fields,
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
        // oxlint-disable-next-line eslint/no-use-before-define -- a struct's fields and a value's struct are mutually recursive
        node: valueNode(member),
      }),
    ),
    Result.all,
    Result.flatMap(distinct),
    Result.map(
      (fields) =>
        new AST.Struct(
          Array.map(fields, ({ name, node }) => [name, node]),
          type,
        ),
    ),
  );

/** Tests for an expression first, because a predicate is a plain object that carries the expression markers rather than fields. */
export const valueNode = (
  value: Structural.Value.Any,
): Result.Result<AST.Node.Any, ProgramError.Construction> => {
  if (
    Expression.isExpression(value) ||
    value === null ||
    typeof value !== "object"
  ) {
    return Expression.toNode(value);
  }

  if (Array.isArray<Structural.Value.Any>(value)) {
    return tupleNode(value);
  }

  return structNode(value);
};

/** Validates an assembled node before attaching its statically established descriptor and requirements. */
export const fromNode = <T extends Type.Any, I>(
  node: Result.Result<AST.Node.Any, ProgramError.Construction>,
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
): Result.Result<readonly AST.Node.Any[], ProgramError.Construction> =>
  Result.all(Array.map(members, valueNode));

/** Applies a fixed kernel collection type to successfully normalized arguments. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructs a collection type from its name and arguments
export const collectionType = (
  name: "List" | "Dict",
  definitions: readonly Structural.Definition[],
): Result.Result<TAST.TypeNode.Any, ProgramError.Construction> =>
  pipe(
    definitions,
    Array.map(typeNode),
    Result.all,
    Result.flatMap((arguments_) =>
      TAST.apply(collectionPaths[name], arguments_),
    ),
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
  readonly (readonly [AST.Node.Any, AST.Node.Any])[],
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
