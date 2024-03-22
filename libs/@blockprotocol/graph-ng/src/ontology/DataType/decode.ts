import { AST } from "@effect/schema";
import * as S from "@effect/schema/Schema";
import { Function, Option, pipe, Predicate } from "effect";

import * as Json from "../../Json.js";
import {
  ArrayDataTypeSchema,
  BooleanDataTypeSchema,
  ConstantDataTypeSchema,
  DataTypeSchema,
  IntegerDataTypeSchema,
  NullDataTypeSchema,
  NumericDataTypeSchema,
  StringDataTypeSchema,
} from "./schema.js";

function decodeConstant<T extends AST.LiteralValue>(
  schema: ConstantDataTypeSchema<T>,
): Option.Option<S.Schema<T>> {
  if (schema.const === undefined) {
    return Option.none();
  }

  return Option.some(S.literal(schema.const));
}

function decodeNumericDataTypeSchema(schema: NumericDataTypeSchema) {
  const { multipleOf, minimum, maximum, exclusiveMinimum, exclusiveMaximum } =
    schema;

  return S.number.pipe(
    Predicate.isNotUndefined(multipleOf)
      ? S.multipleOf(multipleOf)
      : Function.identity,
    Predicate.isNotUndefined(minimum)
      ? S.greaterThanOrEqualTo(minimum)
      : Function.identity,
    Predicate.isNotUndefined(maximum)
      ? S.lessThanOrEqualTo(maximum)
      : Function.identity,
    Predicate.isNotUndefined(exclusiveMinimum)
      ? S.greaterThan(exclusiveMinimum)
      : Function.identity,
    Predicate.isNotUndefined(exclusiveMaximum)
      ? S.lessThan(exclusiveMaximum)
      : Function.identity,
  );
}

function decodeNumberDataTypeSchema(schema: NumericDataTypeSchema) {
  return pipe(
    decodeConstant(schema),
    Option.getOrElse(() => decodeNumericDataTypeSchema(schema)),
  );
}

function decodeIntegerDataTypeSchema(schema: IntegerDataTypeSchema) {
  return pipe(
    decodeNumberDataTypeSchema(schema),
    S.int({ identifier: "Int", title: "Int" }),
  );
}

function decodeStringDataTypeSchema(schema: StringDataTypeSchema) {
  return pipe(
    decodeConstant(schema),
    Option.getOrElse(() => {
      const { minLength, maxLength, pattern } = schema;

      return S.string.pipe(
        Predicate.isNotUndefined(minLength)
          ? S.minLength(minLength)
          : Function.identity,
        Predicate.isNotUndefined(maxLength)
          ? S.maxLength(maxLength)
          : Function.identity,
        Predicate.isNotUndefined(pattern)
          ? S.pattern(new RegExp(pattern))
          : Function.identity,
      );
    }),
  );
}

function decodeBooleanDataTypeSchema(schema: BooleanDataTypeSchema) {
  return pipe(
    decodeConstant(schema),
    Option.getOrElse(() => S.boolean),
  );
}

function decodeNullDataTypeSchema(schema: NullDataTypeSchema) {
  return pipe(
    decodeConstant(schema),
    Option.getOrElse(() => S.null),
  );
}

function decodeArrayDataTypeSchema(schema: ArrayDataTypeSchema) {
  if (schema.const !== undefined) {
    // we only allow for `never[]`, therefore this is ok.
    return S.tuple();
  }

  return S.array(Json.Value);
}

function decodeObjectDataTypeSchema() {
  return S.record(S.string, Json.Value);
}

function decodeSchemaImpl(
  schema: DataTypeSchema,
): S.Schema<unknown, Json.Value> {
  switch (schema.type) {
    case "number":
      return decodeNumberDataTypeSchema(schema) as never;
    case "integer":
      return decodeIntegerDataTypeSchema(schema) as never;
    case "string":
      return decodeStringDataTypeSchema(schema) as never;
    case "boolean":
      return decodeBooleanDataTypeSchema(schema) as never;
    case "null":
      return decodeNullDataTypeSchema(schema) as never;
    case "array":
      return decodeArrayDataTypeSchema(schema) as never;
    case "object":
      return decodeObjectDataTypeSchema() as never;
  }
}

export function decodeSchema(
  schema: DataTypeSchema,
): S.Schema<unknown, Json.Value> {
  return decodeSchemaImpl(schema).pipe(
    S.title(schema.title),
    Predicate.isNotUndefined(schema.description)
      ? S.description(schema.description)
      : Function.identity,
  );
}
