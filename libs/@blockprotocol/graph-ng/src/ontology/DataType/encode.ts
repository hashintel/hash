import { AST } from "@effect/schema";
import {
  Effect,
  Either,
  Order,
  pipe,
  Predicate,
  ReadonlyArray,
  Tuple,
} from "effect";

import {
  escapeStringRegexp,
  pruneUndefinedShallow,
  UndefinedOnPartialShallow,
} from "../../internal/schema.js";
import * as Json from "../../Json.js";
import * as DataType from "../DataType.js";
import {
  asNumberOrUndefined,
  asStringOrUndefined,
} from "../internal/encode.js";
import * as EncodeContext from "../internal/EncodeContext.js";
import { EncodeError } from "./error.js";
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
import { VisitAST } from "../internal/EncodeContext.js";

type Context = EncodeContext.EncodeContext<DataType.DataType<unknown>>;

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

const encodeString = (
  context: Context,
): Effect.Effect<StringDataTypeSchema, EncodeError> =>
  Effect.gen(function* (_) {
    const minLength = yield* _(
      asNumberOrUndefined(context.jsonSchema.additional, "minLength"),
      Effect.mapError(EncodeError.jsonSchema),
    );

    const maxLength = yield* _(
      asNumberOrUndefined(context.jsonSchema.additional, "maxLength"),
      Effect.mapError(EncodeError.jsonSchema),
    );

    const pattern = yield* _(
      asStringOrUndefined(context.jsonSchema.additional, "pattern"),
      Effect.mapError(EncodeError.jsonSchema),
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

const encodeNumber = (
  context: Context,
): Effect.Effect<NumberDataTypeSchema | IntegerDataTypeSchema, EncodeError> =>
  Effect.gen(function* (_) {
    const type = context.jsonSchema.additional.type;
    const isInteger = type === "integer";

    const multipleOf = yield* _(
      asNumberOrUndefined(context.jsonSchema.additional, "multipleOf"),
      Effect.mapError(EncodeError.jsonSchema),
    );
    const minimum = yield* _(
      asNumberOrUndefined(context.jsonSchema.additional, "minimum"),
      Effect.mapError(EncodeError.jsonSchema),
    );
    const maximum = yield* _(
      asNumberOrUndefined(context.jsonSchema.additional, "maximum"),
      Effect.mapError(EncodeError.jsonSchema),
    );
    const exclusiveMinimum = yield* _(
      asNumberOrUndefined(context.jsonSchema.additional, "exclusiveMinimum"),
      Effect.mapError(EncodeError.jsonSchema),
    );
    const exclusiveMaximum = yield* _(
      asNumberOrUndefined(context.jsonSchema.additional, "exclusiveMaximum"),
      Effect.mapError(EncodeError.jsonSchema),
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

const encodeBoolean = (
  context: Context,
): Effect.Effect<BooleanDataTypeSchema, EncodeError> =>
  Effect.gen(function* (_) {
    const base = yield* _(makeBase(context.root, context.jsonSchema));

    return {
      ...base,
      type: "boolean",
    } satisfies BooleanDataTypeSchema;
  });

const encodeEnums = (
  ast: AST.Enums,
  context: Context,
): Effect.Effect<StringDataTypeSchema | IntegerDataTypeSchema, EncodeError> =>
  Effect.gen(function* (_) {
    const values = ast.enums.map(Tuple.getSecond);

    // while not necessarily an error, an empty enum is a never type, therefore we cannot encode it
    // as never types are not supported in DataType schemas
    if (values.length === 0) {
      return yield* _(EncodeError.malformedEnum("empty"));
    }

    // we differentiate between string and number enums
    const stringValues = values.filter(Predicate.isString);
    const numberValues = values.filter(Predicate.isNumber);

    const isStringEnum = ReadonlyArray.isNonEmptyArray(stringValues);
    const isNumberEnum = ReadonlyArray.isNonEmptyArray(numberValues);

    // ...mixed enums are not supported
    if (isStringEnum && isNumberEnum) {
      return yield* _(EncodeError.malformedEnum("mixed"));
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

      return {
        ...base,
        type: "string",
        pattern,
      } satisfies StringDataTypeSchema;
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
      return yield* _(EncodeError.malformedEnum("floating point values"));
    }

    // we create a window of 2 and check if the difference is 1
    // [n, n + 1], [n + 1, n + 2], [n + 2, n + 3], ...
    const isConsecutive = pipe(
      numbers,
      ReadonlyArray.zip(ReadonlyArray.drop(numbers, 1)),
      ReadonlyArray.every(([a, b]) => a + 1 === b),
    );

    if (!isConsecutive) {
      return yield* _(
        EncodeError.malformedEnum("non-consecutive integer values"),
      );
    }

    // we know the array is non-empty;
    const minimum = numbers[0];
    const maximum = numbers.at(-1)!;

    return {
      ...base,
      type: "integer",
      minimum,
      maximum,
    } satisfies IntegerDataTypeSchema;
  });

const encodeTemplateLiteral = (
  ast: AST.TemplateLiteral,
  context: Context,
): Effect.Effect<StringDataTypeSchema, EncodeError> =>
  Effect.gen(function* (_) {
    const base = yield* _(makeBase(context.root, context.jsonSchema));

    return {
      ...base,
      type: "string",
      pattern: AST.getTemplateLiteralRegExp(ast).source,
    } satisfies StringDataTypeSchema;
  });

const encodeTupleType = (
  ast: AST.TupleType,
  context: Context,
): Effect.Effect<ArrayDataTypeSchema, EncodeError> =>
  Effect.gen(function* (_) {
    // BlockProtocol only supports `emptyList`, so an empty tuple
    if (ast.elements.length !== 0) {
      yield* _(EncodeError.unsupportedType("tuple"));
    }

    if (ast.rest.length !== 0) {
      return yield* _(EncodeError.unsupportedType("array"));
    }

    const base = yield* _(makeBase(context.root, context.jsonSchema));

    return {
      ...base,
      type: "array",
      const: [],
    } satisfies ArrayDataTypeSchema;
  });

const encodeTypeLiteral = (
  ast: AST.TypeLiteral,
  context: Context,
): Effect.Effect<ObjectDataTypeSchema, EncodeError> =>
  Effect.gen(function* (_) {
    // we only support opaque objects, that means where we have records with exactly one index signature
    // of {[key: string]: Json.Value}
    // structs are not supported by DataTypes, but by PropertyTypes and EntityTypes
    if (ReadonlyArray.isNonEmptyReadonlyArray(ast.propertySignatures)) {
      return yield* _(EncodeError.unsupportedType("struct"));
    }

    if (ReadonlyArray.isEmptyReadonlyArray(ast.indexSignatures)) {
      return yield* _(EncodeError.malformedRecord("index signature required"));
    }

    if (ast.indexSignatures.length > 1) {
      return yield* _(
        EncodeError.malformedRecord("more than one index signature"),
      );
    }

    const signature = ast.indexSignatures[0];
    if (signature.parameter._tag !== "StringKeyword") {
      return yield* _(
        EncodeError.malformedRecord("parameter must be a string"),
      );
    }

    // the value must be a Json.Value node
    if (!Json.isValueAST(signature.type)) {
      return yield* _(
        EncodeError.malformedRecord("value is not of type `Json.Value`"),
      );
    }

    const base = yield* _(makeBase(context.root, context.jsonSchema));

    return {
      ...base,
      type: "object",
    } satisfies ObjectDataTypeSchema;
  });

const encode = (
  ast: VisitAST,
  parentContext: Context,
): Effect.Effect<DataTypeSchema, EncodeError> =>
  Effect.gen(function* (_) {
    const { node, context } = yield* _(
      EncodeContext.visit(ast, parentContext),
      Effect.mapError(EncodeError.visit),
    );

    switch (node._tag) {
      case "Literal":
        return yield* _(encodeLiteral(node, context));
      case "UndefinedKeyword":
        return yield* _(EncodeError.unsupportedKeyword("undefined"));
      case "Declaration":
        return yield* _(EncodeError.unsupportedNode("Declaration"));
      case "UniqueSymbol":
        return yield* _(EncodeError.unsupportedKeyword("unique symbol"));
      case "VoidKeyword":
        return yield* _(EncodeError.unsupportedKeyword("void"));
      case "NeverKeyword":
        return yield* _(EncodeError.unsupportedKeyword("never"));
      case "UnknownKeyword":
        return yield* _(EncodeError.unsupportedKeyword("unknown"));
      case "AnyKeyword":
        return yield* _(EncodeError.unsupportedType("any"));
      case "StringKeyword":
        return yield* _(encodeString(context));
      case "NumberKeyword":
        return yield* _(encodeNumber(context));
      case "BooleanKeyword":
        return yield* _(encodeBoolean(context));
      case "BigIntKeyword":
        return yield* _(EncodeError.unsupportedType("bigint"));
      case "SymbolKeyword":
        return yield* _(EncodeError.unsupportedType("symbol"));
      case "ObjectKeyword":
        return yield* _(EncodeError.unsupportedType("object"));
      case "Enums":
        return yield* _(encodeEnums(node, context));
      case "TemplateLiteral":
        return yield* _(encodeTemplateLiteral(node, context));
      case "Refinement":
        return yield* _(encode(node.from, context));
      case "TupleType":
        return yield* _(encodeTupleType(node, context));
      case "TypeLiteral":
        return yield* _(encodeTypeLiteral(node, context));
      case "Union":
        // single element unions are automatically flattened
        return yield* _(EncodeError.unsupportedNode("Union"));
      case "Suspend":
        return yield* _(encode(node.f, context));
      case "Transformation":
        return yield* _(encode(node.from, context));
    }
  });

export const encodeSchema = (
  ast: AST.AST,
): Effect.Effect<DataTypeSchema, EncodeError> =>
  Effect.gen(function* (_) {
    const dataType = yield* _(
      DataType.tryFromAST(ast),
      Effect.mapError(EncodeError.internal),
    );

    return yield* _(encode(ast, EncodeContext.make(dataType)));
  });
