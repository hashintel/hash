import { AST } from "@effect/schema";
import {
  absurd,
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
  ObjectDataTypeSchema,
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

function asNumberOrUndefined(
  key: string,
  value: unknown,
): Either.Either<number | undefined, EncodeError> {
  if (isNumberOrUndefined(value)) {
    return Either.right(value);
  }

  return Either.left(
    EncodeError.unsupportedJsonAnnotationType(
      key,
      true,
      "number",
      typeof value,
    ),
  );
}

function asStringOrUndefined(
  key: string,
  value: unknown,
): Either.Either<string | undefined, EncodeError> {
  if (isStringOrUndefined(value)) {
    return Either.right(value);
  }

  return Either.left(
    EncodeError.unsupportedJsonAnnotationType(
      key,
      true,
      "string",
      typeof value,
    ),
  );
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
  return Either.gen(function* (_) {
    const base = yield* _(makeBase(context.root, context.jsonSchema));

    const literal = ast.literal;

    if (Predicate.isString(literal)) {
      return {
        ...base,
        type: "string",
        const: literal,
      } satisfies StringDataTypeSchema;
    }

    if (Predicate.isNumber(literal)) {
      return {
        ...base,
        type: "number",
        const: literal,
      } satisfies NumberDataTypeSchema;
    }

    if (Predicate.isBoolean(literal)) {
      return {
        ...base,
        type: "boolean",
        const: literal,
      } satisfies BooleanDataTypeSchema;
    }

    if (Predicate.isNull(literal)) {
      return {
        ...base,
        type: "null",
      } satisfies NullDataTypeSchema;
    }

    return yield* _(Either.left(EncodeError.unsupportedLiteral("bigint")));
  });
}

function encodeString(
  context: Context,
): Either.Either<StringDataTypeSchema, EncodeError> {
  return Either.gen(function* (_) {
    const minLength = yield* _(
      asNumberOrUndefined("minLength", context.jsonSchema.additional.minLength),
    );

    const maxLength = yield* _(
      asNumberOrUndefined("maxLength", context.jsonSchema.additional.maxLength),
    );

    const pattern = yield* _(
      asStringOrUndefined("pattern", context.jsonSchema.additional.pattern),
    );

    const base = yield* _(makeBase(context.root, context.jsonSchema));

    const partialSchema = {
      ...base,
      type: "string",
      minLength,
      maxLength,
      pattern,
    } satisfies UndefinedOnPartialShallow<StringDataTypeSchema>;

    return pruneUndefinedShallow(partialSchema);
  });
}

function encodeNumber(
  context: Context,
): Either.Either<NumberDataTypeSchema | IntegerDataTypeSchema, EncodeError> {
  return Either.gen(function* (_) {
    const type = context.jsonSchema.additional.type;
    const isInteger = type === "integer";

    const multipleOf = yield* _(
      asNumberOrUndefined(
        "multipleOf",
        context.jsonSchema.additional.multipleOf,
      ),
    );
    const minimum = yield* _(
      asNumberOrUndefined("minimum", context.jsonSchema.additional.minimum),
    );
    const maximum = yield* _(
      asNumberOrUndefined("maximum", context.jsonSchema.additional.maximum),
    );
    const exclusiveMinimum = yield* _(
      asNumberOrUndefined(
        "exclusiveMinimum",
        context.jsonSchema.additional.exclusiveMinimum,
      ),
    );
    const exclusiveMaximum = yield* _(
      asNumberOrUndefined(
        "exclusiveMaximum",
        context.jsonSchema.additional.exclusiveMaximum,
      ),
    );

    const base = yield* _(makeBase(context.root, context.jsonSchema));

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

    return pruneUndefinedShallow(partialSchema);
  });
}

function encodeBoolean(
  context: Context,
): Either.Either<BooleanDataTypeSchema, EncodeError> {
  return Either.gen(function* (_) {
    const base = yield* _(makeBase(context.root, context.jsonSchema));

    const schema = {
      ...base,
      type: "boolean",
    } satisfies BooleanDataTypeSchema;

    return schema;
  });
}

function encodeEnums(
  ast: AST.Enums,
  context: Context,
): Either.Either<StringDataTypeSchema | IntegerDataTypeSchema, EncodeError> {
  return Either.gen(function* (_) {
    const values = ast.enums.map(Tuple.getSecond);

    // while not necessarily an error, an empty enum is a never type, therefore we cannot encode it
    // as never types are not supported in DataType schemas
    if (values.length === 0) {
      yield* _(Either.left(EncodeError.malformedEnum("empty")));
    }

    // we differentiate between string and number enums
    const stringValues = values.filter(Predicate.isString);
    const numberValues = values.filter(Predicate.isNumber);

    const isStringEnum = ReadonlyArray.isNonEmptyArray(stringValues);
    const isNumberEnum = ReadonlyArray.isNonEmptyArray(numberValues);

    // ...mixed enums are not supported
    if (isStringEnum && isNumberEnum) {
      yield* _(Either.left(EncodeError.malformedEnum("mixed")));
    }

    const base = yield* _(makeBase(context.root, context.jsonSchema));

    if (isStringEnum) {
      // BP does not support `enum` as a keyword, therefore we have to use `pattern` instead
      // we escape the strings and join them with a pipe
      const pattern = pipe(
        stringValues,
        ReadonlyArray.map(escapeStringRegexp),
        // eslint-disable-next-line @typescript-eslint/no-shadow
        ReadonlyArray.map((_) => `(${_})`),
        ReadonlyArray.join("|"),
        // eslint-disable-next-line @typescript-eslint/no-shadow
        (_) => `^${_}$`,
      );

      const schema = {
        ...base,
        type: "string",
        pattern,
      } satisfies StringDataTypeSchema;

      return schema;
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
      yield* _(Either.left(EncodeError.malformedEnum("floating point values")));
    }

    // we create a window of 2 and check if the difference is 1
    // [n, n + 1], [n + 1, n + 2], [n + 2, n + 3], ...
    const isConsecutive = pipe(
      numbers,
      ReadonlyArray.zip(ReadonlyArray.drop(numbers, 1)),
      ReadonlyArray.every(([a, b]) => a + 1 === b),
    );

    if (!isConsecutive) {
      yield* _(
        Either.left(
          EncodeError.malformedEnum("non-consecutive integer values"),
        ),
      );
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

    return schema;
  });
}

function encodeTemplateLiteral(
  ast: AST.TemplateLiteral,
  context: Context,
): Either.Either<StringDataTypeSchema, EncodeError> {
  return Either.gen(function* (_) {
    const base = yield* _(makeBase(context.root, context.jsonSchema));

    const schema = {
      ...base,
      type: "string",
      pattern: AST.getTemplateLiteralRegExp(ast).source,
    } satisfies StringDataTypeSchema;

    return schema;
  });
}

function encodeTupleType(
  ast: AST.TupleType,
  context: Context,
): Either.Either<DataTypeSchema, EncodeError> {
  return Either.gen(function* (_) {
    // BlockProtocol only supports `emptyList`, so an empty tuple
    if (ast.elements.length !== 0) {
      yield* _(Either.left(EncodeError.unsupportedType("tuple")));
    }

    if (ast.rest.length !== 0) {
      yield* _(Either.left(EncodeError.unsupportedType("array")));
    }

    const base = yield* _(makeBase(context.root, context.jsonSchema));

    const schema = {
      ...base,
      type: "array",
      const: [],
    } satisfies ArrayDataTypeSchema;

    return schema;
  });
}

function encodeTypeLiteral(
  ast: AST.TypeLiteral,
  context: Context,
): Either.Either<ObjectDataTypeSchema, EncodeError> {
  // we only support opaque objects, that means where we have records with exactly one index signature
  // of {[key: string]: Json.Value}
  // structs are not supported by DataTypes, but by PropertyTypes and EntityTypes
  if (ReadonlyArray.isNonEmptyReadonlyArray(ast.propertySignatures)) {
    return Either.left(EncodeError.unsupportedType("struct"));
  }
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
      return Either.left(EncodeError.unsupportedNode("Declaration"));
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
      return Either.left(EncodeError.unsupportedNode("Union"));
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
    return Either.left(
      EncodeError.malformedDataType("[INTERNAL] annotation missing"),
    );
  }

  const dataType: unknown = annotation();
  if (!DataType.isDataType(dataType)) {
    return Either.left(
      EncodeError.malformedDataType("[INTERNAL] annotation is not a DataType"),
    );
  }

  return encode(ast, {
    root: dataType,
    jsonSchema: getJsonSchema(ast),
    traversed: HashSet.empty(),
    path: [],
  });
}
