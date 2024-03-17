import { AST } from "@effect/schema";
import {
  Brand,
  Either,
  HashSet,
  Option,
  Order,
  pipe,
  Predicate,
  ReadonlyArray,
  ReadonlyRecord,
  Tuple,
} from "effect";

import {
  escapeStringRegexp,
  pruneUndefinedShallow,
  UndefinedOnPartialShallow,
} from "../../internal/schema.js";
import * as DataType from "../DataType.js";
import { EncodeError } from "./errors.js";
import {
  ArrayDataTypeSchema,
  BooleanDataTypeSchema,
  DataTypeSchema,
  IntegerDataTypeSchema,
  makeBase,
  NullDataTypeSchema,
  NumberDataTypeSchema,
  StringDataTypeSchema,
} from "./schema.js";

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

  readonly additional: Record<string, unknown>;
}

function getJsonSchema(ast: AST.Annotated): JsonSchema {
  const record = ReadonlyRecord.getSomes({
    title: AST.getTitleAnnotation(ast),
    description: AST.getDescriptionAnnotation(ast),
  });

  const additional = AST.getJSONSchemaAnnotation(ast) as Option.Option<
    Record<string, unknown>
  >;

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

const isNumberOrUndefined: (value: unknown) => value is number | undefined =
  Predicate.or(Predicate.isUndefined, Predicate.isNumber) as never;
const isStringOrUndefined: (value: unknown) => value is string | undefined =
  Predicate.or(Predicate.isUndefined, Predicate.isString) as never;

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

function encodeString(
  context: Context,
): Either.Either<StringDataTypeSchema, EncodeError> {
  const minLength = context.jsonSchema.additional.minLength;
  const maxLength = context.jsonSchema.additional.maxLength;
  const pattern = context.jsonSchema.additional.pattern;

  const maybeBase = makeBase(context.root, context.jsonSchema);
  if (Option.isNone(maybeBase)) {
    return Either.left(EncodeError.noTitle());
  }

  const base = maybeBase.value;

  if (!isNumberOrUndefined(minLength)) {
    return Either.left(
      EncodeError.unsupportedJsonAnnotationType(
        "minLength",
        true,
        "number",
        typeof minLength,
      ),
    );
  }

  if (!isNumberOrUndefined(maxLength)) {
    return Either.left(
      EncodeError.unsupportedJsonAnnotationType(
        "maxLength",
        true,
        "number",
        typeof maxLength,
      ),
    );
  }

  if (!isStringOrUndefined(pattern)) {
    return Either.left(
      EncodeError.unsupportedJsonAnnotationType(
        "pattern",
        true,
        "string",
        typeof pattern,
      ),
    );
  }

  const partialSchema = {
    ...base,
    type: "string",
    minLength,
    maxLength,
    pattern,
  } satisfies UndefinedOnPartialShallow<StringDataTypeSchema>;

  return Either.right(pruneUndefinedShallow(partialSchema));
}

function encodeNumber(
  context: Context,
): Either.Either<NumberDataTypeSchema | IntegerDataTypeSchema, EncodeError> {
  const type = context.jsonSchema.additional.type;
  const isInteger = type === "integer";

  const multipleOf = context.jsonSchema.additional.multipleOf;
  const minimum = context.jsonSchema.additional.minimum;
  const maximum = context.jsonSchema.additional.maximum;
  const exclusiveMinimum = context.jsonSchema.additional.exclusiveMinimum;
  const exclusiveMaximum = context.jsonSchema.additional.exclusiveMaximum;

  const maybeBase = makeBase(context.root, context.jsonSchema);
  if (Option.isNone(maybeBase)) {
    return Either.left(EncodeError.noTitle());
  }

  const base = maybeBase.value;

  if (!isNumberOrUndefined(multipleOf)) {
    return Either.left(
      EncodeError.unsupportedJsonAnnotationType(
        "multipleOf",
        true,
        "number",
        typeof multipleOf,
      ),
    );
  }

  if (!isNumberOrUndefined(minimum)) {
    return Either.left(
      EncodeError.unsupportedJsonAnnotationType(
        "minimum",
        true,
        "number",
        typeof minimum,
      ),
    );
  }

  if (!isNumberOrUndefined(maximum)) {
    return Either.left(
      EncodeError.unsupportedJsonAnnotationType(
        "maximum",
        true,
        "number",
        typeof maximum,
      ),
    );
  }

  if (!isNumberOrUndefined(exclusiveMinimum)) {
    return Either.left(
      EncodeError.unsupportedJsonAnnotationType(
        "exclusiveMinimum",
        true,
        "number",
        typeof exclusiveMinimum,
      ),
    );
  }

  if (!isNumberOrUndefined(exclusiveMaximum)) {
    return Either.left(
      EncodeError.unsupportedJsonAnnotationType(
        "exclusiveMaximum",
        true,
        "number",
        typeof exclusiveMaximum,
      ),
    );
  }

  const partialSchema = {
    ...base,
    type: isInteger ? "integer" : "number",
    multipleOf,
    minimum,
    maximum,
    exclusiveMinimum,
    exclusiveMaximum,
  } satisfies UndefinedOnPartialShallow<
    NumberDataTypeSchema | IntegerDataTypeSchema
  >;
  const schema = pruneUndefinedShallow(partialSchema);

  return Either.right(schema);
}

function encodeBoolean(
  context: Context,
): Either.Either<BooleanDataTypeSchema, EncodeError> {
  const maybeBase = makeBase(context.root, context.jsonSchema);
  if (Option.isNone(maybeBase)) {
    return Either.left(EncodeError.noTitle());
  }

  const base = maybeBase.value;

  const schema = {
    ...base,
    type: "boolean",
  } satisfies BooleanDataTypeSchema;

  return Either.right(schema);
}

function encodeEnums(
  ast: AST.Enums,
  context: Context,
): Either.Either<StringDataTypeSchema | IntegerDataTypeSchema, EncodeError> {
  const variants = ast.enums;

  // we differentiate between string and number enums, mixed enums are not supported
  const values = variants.map(Tuple.getSecond);
  const stringValues = values.filter(Predicate.isString);
  const numberValues = values.filter(Predicate.isNumber);

  if (variants.length === 0) {
    // while not necessarily an error, an empty enum is a never type, therefore we cannot encode it
    // as never types are not supported in DataType schemas
    return Either.left(EncodeError.emptyEnum());
  }

  if (stringValues.length > 0 && numberValues.length > 0) {
    return Either.left(EncodeError.mixedEnum());
  }

  const maybeBase = makeBase(context.root, context.jsonSchema);
  if (Option.isNone(maybeBase)) {
    return Either.left(EncodeError.noTitle());
  }

  const base = maybeBase.value;

  if (stringValues.length > 0) {
    // BP does not support `enum` as a keyword, therefore we have to use `pattern` instead
    // we escape the strings and join them with a pipe
    const pattern = pipe(
      stringValues,
      ReadonlyArray.map(escapeStringRegexp),
      ReadonlyArray.map((_) => `(${_})`),
      ReadonlyArray.join("|"),
      (_) => `^${_}$`,
    );

    const schema = {
      ...base,
      type: "string",
      pattern,
    } satisfies StringDataTypeSchema;

    return Either.right(schema);
  }

  // we first see if all the values are integers, in that case we sort them and see if they are consecutive
  // if they are we can use minimum and maximum to define the range
  // otherwise we error out
  const numbers = pipe(
    numberValues,
    ReadonlyArray.sort(Order.number),
    ReadonlyArray.filter(Number.isInteger),
  );

  if (numbers.length !== numberValues.length) {
    return Either.left(EncodeError.floatingPointEnum());
  }

  // we create a window of 2 and check if the difference is 1
  // [n, n + 1], [n + 1, n + 2], [n + 2, n + 3], ...
  const isConsecutive = pipe(
    numbers,
    ReadonlyArray.zip(ReadonlyArray.drop(numbers, 1)),
    ReadonlyArray.every(([a, b]) => a + 1 === b),
  );

  if (!isConsecutive) {
    return Either.left(EncodeError.nonConsecutiveIntegerEnum());
  }

  // we know the array is non-empty;
  const minimum = numbers[0]!;
  const maximum = numbers.at(-1)!;

  const schema = {
    ...base,
    type: "integer",
    minimum,
    maximum,
  } satisfies IntegerDataTypeSchema;

  return Either.right(schema);
}

function encodeTemplateLiteral(
  ast: AST.TemplateLiteral,
  context: Context,
): Either.Either<StringDataTypeSchema, EncodeError> {
  // TODO: make this error out instead?!
  const maybeBase = makeBase(context.root, context.jsonSchema);
  if (Option.isNone(maybeBase)) {
    return Either.left(EncodeError.noTitle());
  }

  const base = maybeBase.value;

  const schema = {
    ...base,
    type: "string",
    pattern: AST.getTemplateLiteralRegExp(ast).source,
  } satisfies StringDataTypeSchema;

  return Either.right(schema);
}

function encodeTupleType(
  ast: AST.TupleType,
  context: Context,
): Either.Either<DataTypeSchema, EncodeError> {
  // BlockProtocol only supports `emptyList`, so an empty tuple
  if (ast.elements.length !== 0) {
    return Either.left(EncodeError.unsupportedType("tuple"));
  }

  if (ast.rest.length !== 0) {
    return Either.left(EncodeError.unsupportedType("array"));
  }

  const maybeBase = makeBase(context.root, context.jsonSchema);
  if (Option.isNone(maybeBase)) {
    return Either.left(EncodeError.noTitle());
  }

  const base = maybeBase.value;

  const schema = {
    ...base,
    type: "array",
    const: [],
  } satisfies ArrayDataTypeSchema;

  return Either.right(schema);
}

function encode(
  ast: AST.AST,
  context: Context,
): Either.Either<DataTypeSchema, EncodeError> {
  const traverseResult = traverse(ast, context);
  if (Either.isLeft(traverseResult)) {
    return Either.left(traverseResult.left);
  }

  const localContext = traverseResult.right;

  switch (ast._tag) {
    case "Literal":
      return encodeLiteral(ast, localContext);
    case "UndefinedKeyword":
      return Either.left(EncodeError.unsupportedKeyword("undefined"));
    case "Declaration":
      return Either.left(EncodeError.unsupportedDeclaredType());
    case "UniqueSymbol":
      return Either.left(EncodeError.unsupportedKeyword("unique symbol"));
    case "VoidKeyword":
      return Either.left(EncodeError.unsupportedKeyword("void"));
    case "NeverKeyword":
      return Either.left(EncodeError.unsupportedKeyword("never"));
    case "UnknownKeyword":
      return Either.left(EncodeError.unsupportedKeyword("unknown"));
    case "AnyKeyword":
      return Either.left(EncodeError.unsupportedType("any"));
    case "StringKeyword":
      return encodeString(localContext);
    case "NumberKeyword":
      return encodeNumber(localContext);
    case "BooleanKeyword":
      return encodeBoolean(localContext);
    case "BigIntKeyword":
      return Either.left(EncodeError.unsupportedType("bigint"));
    case "SymbolKeyword":
      return Either.left(EncodeError.unsupportedType("symbol"));
    case "ObjectKeyword":
      return Either.left(EncodeError.unsupportedType("object"));
    case "Enums":
      return encodeEnums(ast, localContext);
    case "TemplateLiteral":
      return encodeTemplateLiteral(ast, localContext);
    case "Refinement":
      return encode(ast.from, localContext);
    case "TupleType":
      return encodeTupleType(ast, localContext);
    case "TypeLiteral":
    case "Union":
      // single element unions are automatically flattened
      return Either.left(EncodeError.unsupportedUnion());
    case "Suspend":
      return encode(ast.f(), localContext);
    case "Transformation":
      return encode(ast.from, localContext);
  }
}

export function encodeSchema(
  ast: AST.AST,
): Either.Either<DataTypeSchema, EncodeError> {
  const annotation: unknown = ast.annotations[DataType.AnnotationId];
  if (!Predicate.isFunction(annotation)) {
    return Either.left(EncodeError.dataTypeMalformed());
  }

  const dataType: unknown = annotation();
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
