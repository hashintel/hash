import {
  Either,
  Equal,
  Hash,
  HashSet,
  Inspectable,
  Option,
  pipe,
  Pipeable,
  Predicate,
} from "effect";
import * as S from "@effect/schema/Schema";
import * as DataTypeUrl from "./DataTypeUrl";
import * as Json from "../internal/Json";
import {
  typeLiteral,
  unsupportedKeyword,
  ValidationError,
  ValidationErrorReason,
} from "./DataType/errors";
import { AST } from "@effect/schema";

const TypeId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/DataType",
);
export type TypeId = typeof TypeId;

interface Annotations {}

export interface DataType<T>
  extends Equal.Equal,
    Pipeable.Pipeable,
    Inspectable.Inspectable {
  [TypeId]: TypeId;

  readonly id: DataTypeUrl.DataTypeUrl;
  readonly schema: S.Schema<T, Json.Value>;

  readonly annotations: Annotations;
}

interface DataTypeImpl<T> extends DataType<T> {}

const DataTypeProto: DataTypeImpl<unknown> = {
  [TypeId]: TypeId,
  annotations: {},

  toJSON(): unknown {
    return {
      _id: "DataType",
      id: this.id,
      schema: this.schema.ast.toJSON(),
    };
  },
  toString(this: DataTypeImpl<unknown>): string {
    return Inspectable.format(this.toJSON());
  },
  [Inspectable.NodeInspectSymbol]() {
    return this.toJSON();
  },
  pipe() {
    Pipeable.pipeArguments(this, arguments);
  },

  [Hash.symbol](this: DataTypeImpl<unknown>) {
    const hash = pipe(Hash.hash(TypeId), Hash.combine(Hash.hash(this.id)));

    return Hash.cached(this, hash);
  },
  [Equal.symbol]<T>(this: DataType<T>, that: unknown): boolean {
    if (!isDataType(that)) {
      return false;
    }

    return this.id === that.id;
  },
};

export interface Schema {
  readonly $schema: "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type";
  readonly kind: "dataType";

  readonly $id: DataTypeUrl.DataTypeUrl;

  readonly title: string;
  readonly description?: string;

  readonly type: string;
}

export function isDataType(value: unknown): value is DataType<unknown> {
  return Predicate.hasProperty(value, TypeId);
}

export function validate(
  schema: S.Schema<unknown, Json.Value>,
): Either.Either<null, ValidationError> {
  const ast = schema.ast;
  const hashes = HashSet.make(AST.hash(ast));

  return validateAST(ast, hashes);
}

function validateASTParameter(
  ast: AST.Parameter,
  hashes: HashSet.HashSet<number>,
): Either.Either<null, ValidationError> {
  switch (ast._tag) {
    case "StringKeyword":
      break;
    case "SymbolKeyword":
      return Either.left(unsupportedKeyword("symbol"));
    case "TemplateLiteral":
      break;
    case "Refinement":
      return validateAST(ast.from, hashes);
  }

  return Either.right(null);
}

// TODO: tbh already create the AST for the schema
function validateAST(
  ast: AST.AST,
  hashes: HashSet.HashSet<number>,
): Either.Either<null, ValidationError> {
  switch (ast._tag) {
    case "Literal":
    case "StringKeyword":
    case "NumberKeyword":
    case "BooleanKeyword":
    case "BigIntKeyword":
    case "TemplateLiteral":
    case "Enums":
      break;

    case "Declaration":
      // custom types, they are not supported
      return Either.left(
        new ValidationError({
          reason: ValidationErrorReason.CustomTypeNotSupported(),
        }),
      );
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
    case "SymbolKeyword":
      return Either.left(unsupportedKeyword("symbol"));
    case "ObjectKeyword":
      return Either.left(unsupportedKeyword("object"));

    case "Refinement":
      return validateAST(ast.from, hashes);
    case "TupleType":
      if (ast.elements.length !== 0 || ast.rest.length !== 1) {
        return Either.left(unsupportedKeyword("tuple"));
      }
      break;
    case "TypeLiteral":
      // includes things like: record and struct, struct we don't support, record we do
      if (ast.propertySignatures.length !== 0) {
        return Either.left(typeLiteral("property signature present"));
      }

      if (ast.indexSignatures.length === 0) {
        return Either.left(typeLiteral("index signature required"));
      }

      if (ast.indexSignatures.length > 1) {
        return Either.left(typeLiteral("more than one index signature"));
      }

      const signature = ast.indexSignatures[0]!;

      validateAST(signature.type, hashes).pipe(
        Either.andThen(() => validateASTParameter(signature.parameter, hashes)),
      );
      break;
    case "Union":
      return Either.left(
        new ValidationError({
          reason: ValidationErrorReason.UnionNotSupported(),
        }),
      );
    case "Suspend":
      const childAst = ast.f();
      const childHash = AST.hash(childAst);

      if (HashSet.has(hashes, childHash)) {
        return Either.left(
          new ValidationError({
            reason: ValidationErrorReason.RecursiveTypeNotSupported(),
          }),
        );
      }

      return validateAST(childAst, HashSet.add(hashes, childHash));
    case "Transformation":
      return validateAST(ast.from, hashes);
  }

  return Either.right(null);
}
