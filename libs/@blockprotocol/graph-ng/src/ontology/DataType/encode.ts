import {
  Brand,
  Either,
  HashSet,
  Option,
  Predicate,
  ReadonlyRecord,
} from "effect";
import { AST } from "@effect/schema";
import {
  BooleanDataTypeSchema,
  DataTypeSchema,
  makeBase,
  NullDataTypeSchema,
  NumberDataTypeSchema,
  StringDataTypeSchema,
} from "./schema";
import { EncodeError } from "./errors";
import * as DataType from "../DataType";
import { JsonSchema7 } from "@effect/schema/JSONSchema";

type ASTHash = Brand.Branded<number, "ASTHash">;
const ASTHash = Brand.nominal<ASTHash>();

type PathComponent =
  | {
      _tag: "Entry";
      key: string;
    }
  | {
      _tag: "Index";
      index: number;
    };

interface JsonSchema {
  readonly title?: string;
  readonly description?: string;

  readonly additional: Record<string, any>;
}

function getJsonSchema(ast: AST.Annotated): JsonSchema {
  const record = ReadonlyRecord.getSomes({
    title: AST.getTitleAnnotation(ast),
    description: AST.getDescriptionAnnotation(ast),
  });

  const additional = AST.getJSONSchemaAnnotation(
    ast,
  ) as Option.Option<JsonSchema7>;

  return { ...record, additional: Option.getOrElse(additional, () => ({})) };
}

function updateJsonSchema(current: JsonSchema, ast: AST.Annotated): JsonSchema {
  const update = getJsonSchema(ast);

  return {
    ...current,
    ...update,
    additional: { ...current.additional, ...update.additional },
  };
}

interface Context {
  readonly root: DataType.DataType<unknown>;
  readonly traversed: HashSet.HashSet<ASTHash>;
  readonly path: ReadonlyArray<PathComponent>;

  readonly jsonSchema: JsonSchema;
}

function hashNode(ast: AST.AST): ASTHash {
  return ASTHash(AST.hash(ast));
}

function traverse(
  ast: AST.AST,
  context: Context,
): Either.Either<Context, EncodeError> {
  if (HashSet.has(context.traversed, hashNode(ast))) {
    return Either.left(EncodeError.cyclicSchema());
  }

  return Either.right({
    root: context.root,
    traversed: HashSet.add(context.traversed, hashNode(ast)),
    path: context.path,
    jsonSchema: updateJsonSchema(context.jsonSchema, ast),
  });
}

function encodeLiteral(
  ast: AST.Literal,
  context: Context,
): Either.Either<DataTypeSchema, EncodeError> {
  const maybeBase = makeBase(context.root, context.jsonSchema);
  if (Option.isNone(maybeBase)) {
    return Either.left(EncodeError.noTitle());
  }
  const base = maybeBase.value;

  const literal = ast.literal;

  if (Predicate.isString(literal)) {
    const schema = {
      ...base,
      type: "string",
      const: literal,
    } satisfies StringDataTypeSchema;

    return Either.right(schema);
  }

  if (Predicate.isNumber(literal)) {
    const schema = {
      ...base,
      type: "number",
      const: literal,
    } satisfies NumberDataTypeSchema;

    return Either.right(schema);
  }

  if (Predicate.isBoolean(literal)) {
    const schema = {
      ...base,
      type: "boolean",
      const: literal,
    } satisfies BooleanDataTypeSchema;

    return Either.right(schema);
  }

  if (Predicate.isNull(literal)) {
    const schema = {
      ...base,
      type: "null",
    } satisfies NullDataTypeSchema;

    return Either.right(schema);
  }

  return Either.left(EncodeError.unsupportedLiteral("bigint"));
}

function encode(
  ast: AST.AST,
  context: Context,
): Either.Either<DataTypeSchema, EncodeError> {
  const traverseResult = traverse(ast, context);
  if (Either.isLeft(traverseResult)) {
    return Either.left(traverseResult.left);
  }

  context = traverseResult.right;

  switch (ast._tag) {
    case "Literal":
      return encodeLiteral(ast, context);
    case "UndefinedKeyword":
    case "Declaration":
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
    case "Refinement":
    case "TupleType":
    case "TypeLiteral":
    case "Union":
    case "Suspend":
    case "Transformation":
      throw new Error("Not implemented");
  }
}

export function encodeSchema(
  ast: AST.AST,
): Either.Either<DataTypeSchema, EncodeError> {
  const annotation: unknown = ast.annotations[DataType.AnnotationId];
  if (!Predicate.isFunction(annotation)) {
    return Either.left(EncodeError.dataTypeMalformed());
  }
  const dataType = annotation();

  if (!DataType.isDataType(dataType)) {
    return Either.left(EncodeError.dataTypeMalformed());
  }

  return encode(ast, {
    root: dataType,
    jsonSchema: getJsonSchema(ast),
    traversed: HashSet.empty(),
    path: [],
  });
}
