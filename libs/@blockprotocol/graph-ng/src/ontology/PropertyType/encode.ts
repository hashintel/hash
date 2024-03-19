import { AST } from "@effect/schema";
import { Either, pipe, ReadonlyArray, Function, Stream, Effect } from "effect";

import * as EncodeContext from "../internal/EncodeContext.js";
import * as PropertyType from "../PropertyType.js";
import { EncodeError } from "./error.js";
import { PropertyTypeSchema } from "./schema.js";

type Context = EncodeContext.EncodeContext<PropertyType.PropertyType<unknown>>;

type PreparedAST = Exclude<
  AST.AST,
  AST.Refinement | AST.Suspend | AST.Transformation
>;

function flattenUnion(
  ast: AST.Union,
  parentContext: Context,
): Either.Either<AST.Union, EncodeError> {
  const types = ast.types;

  function flattenUnionImpl(
    types: readonly AST.AST[],
    parentContext: Context,
  ): Either.Either<AST.AST, EncodeError> {
    // this could be modelled with `Stream.Stream`, but that would mean we buy into the whole effect system until the
    // top which is a bit overkill (for now?!)
    const children = [];

    for (const child of types) {
      if (!AST.isUnion(child)) {
        children.push(child);
        continue;
      }

      const context = EncodeContext.visit(child, parentContext);
      if (Either.isLeft(context)) {
        return Either.left(EncodeError.visit(context.left));
      }

      const result = flattenUnionImpl(child.types, context.right);
      if (Either.isLeft(result)) {
        return result;
      }

      children.push(result.right);
    }

    const map = pipe(
      types,
      ReadonlyArray.map((type) =>
        Either.gen(function* (_) {
          if (!AST.isUnion(type)) {
            return [type];
          }

          const context = yield* _(
            EncodeContext.visit(type, parentContext),
            Either.mapLeft(EncodeError.visit),
          );

          const result = yield* _(flattenUnionImpl(type.types, context));
          return result;
        }),
      ),
      Either.all,
    );

    if (Either.isLeft(map)) {
      return Either.left(map.left);
    }

    return Either.right(pipe(map.right, ReadonlyArray.flatten));
  }

  // recursively flatten unions, by adding their items to the stack
  return pipe(types, ReadonlyArray.flatMap);
}

function prepare(
  ast: AST.AST,
  parentContext: Context,
): Either.Either<PreparedAST, EncodeError> {
  const eitherContext = EncodeContext.visit(ast, parentContext);
  if (Either.isLeft(eitherContext)) {
    return Either.left(EncodeError.visit(eitherContext.left));
  }

  const context = eitherContext.right;

  switch (ast._tag) {
    case "UndefinedKeyword":
    case "Declaration":
    case "Literal":
    case "UniqueSymbol":
    case "VoidKeyword":
    case "NeverKeyword":
    case "UnknownKeyword":
    case "AnyKeyword":
    case "StringKeyword":
    case "NumberKeyword":
    case "BooleanKeyword":
    case "BigIntKeyword":
    case "SymbolKeyword":
    case "ObjectKeyword":
    case "Enums":
    case "TemplateLiteral":
      return Either.right(ast);
    case "Refinement":
      return prepare(ast.from, context);
    case "TupleType":
    case "TypeLiteral":
    case "Union":
      // flatten unions
      return Either.right(ast);
    case "Suspend":
      return prepare(ast.f(), context);
    case "Transformation":
      return prepare(ast.from, context);
  }
}

export function encodeSchema(
  ast: AST.AST,
): Either.Either<PropertyTypeSchema, EncodeError> {
  throw new Error("Not implemented");
}
