import { AST } from "@effect/schema";
import { Either } from "effect";

import * as EncodeContext from "../internal/EncodeContext.js";
import * as PropertyType from "../PropertyType.js";
import { EncodeError } from "./error.js";
import { PropertyTypeSchema } from "./schema.js";

type Context = EncodeContext.EncodeContext<PropertyType.PropertyType<unknown>>;

type PreparedAST = Exclude<
  AST.AST,
  AST.Refinement | AST.Suspend | AST.Transformation
>;

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
