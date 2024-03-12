import { Either } from "effect";
import * as S from "@effect/schema/Schema";
import * as DataTypeUrl from "./DataTypeUrl";
import * as Json from "../internal/Json";
import {
  unsupportedKeyword,
  ValidationError,
  ValidationErrorReason,
} from "./DataType/errors";

const TypeId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/DataType",
);
export type TypeId = typeof TypeId;

interface Annotations {}

interface DataType<T> {
  [TypeId]: TypeId;

  readonly id: DataTypeUrl.DataTypeUrl;
  readonly schema: S.Schema<T, Json.Value>;

  readonly annotations: Annotations;
}

function validate(
  schema: S.Schema<unknown, Json.Value>,
): Either.Either<null, ValidationError> {
  const ast = schema.ast;

  switch (ast._tag) {
    case "Declaration":
      break;
    case "Literal":
      break;
    case "UniqueSymbol":
      return Either.left(unsupportedKeyword("unique symbol"));
    case "VoidKeyword":
      return Either.left(unsupportedKeyword("void"));
    case "NeverKeyword":
      return Either.left(unsupportedKeyword("never"));
    case "UnknownKeyword":
      return Either.left(unsupportedKeyword("unknown"));
    case "AnyKeyword":
      return Either.left(unsupportedKeyword("any"));
    case "UndefinedKeyword":
      return Either.left(unsupportedKeyword("undefined"));
    case "StringKeyword":
    case "NumberKeyword":
    case "BooleanKeyword":
    case "BigIntKeyword":
      break;
    case "SymbolKeyword":
      return Either.left(
        new ValidationError({
          reason: ValidationErrorReason.UnsupportedKeyword({
            keyword: "symbol",
          }),
        }),
      );
    case "ObjectKeyword":
      // TODO: only if no inner type
      break;
    case "Enums":
      break;
    case "TemplateLiteral":
      break;
    case "Refinement":
      break;
    case "Tuple":
      break;
    case "TypeLiteral":
      break;
    case "Union":
      return Either.left(
        new ValidationError({
          reason: ValidationErrorReason.UnionNotSupported(),
        }),
      );
    case "Suspend":
      break;
    case "Transform":
      break;
  }

  return Either.right(null);
}
