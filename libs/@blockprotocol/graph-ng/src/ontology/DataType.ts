import * as S from "@effect/schema/Schema";
import * as Brand from "effect/Brand";

import * as DataTypeUrl from "./DataTypeUrl";
import * as BooleanType from "./internal/BooleanType";
import * as NullType from "./internal/NullType";
import * as NumberType from "./internal/NumberType";
import * as StringType from "./internal/StringType";
import * as ObjectType from "./internal/ObjectType";
import * as ArrayType from "./internal/ArrayType";

const TypeId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/DataType",
);
export type TypeId = typeof TypeId;

const InnerType = S.union(
  StringType.StringType,
  NumberType.NumberType,
  BooleanType.BooleanType,
  NullType.NullType,
  ObjectType.ObjectType,
  ArrayType.ArrayType,
);

export const DataType = S.extend(
  S.extend(
    S.struct({
      kind: S.literal("dataType"),

      id: DataTypeUrl.DataTypeUrl,
      title: S.string.pipe(S.nonEmpty()),
      description: S.optional(S.string.pipe(S.nonEmpty())),
    }),
    InnerType,
  ),
  S.record(S.string, S.any),
);

export type DataType = S.Schema.To<typeof DataType>;

// TODO: branding

export function makeSchema<T extends DataType>(
  schema: T,
): T extends StringType.StringType
  ? StringType.ValueSchema<T>
  : T extends NumberType.NumberType
  ? NumberType.ValueSchema
  : T extends BooleanType.BooleanType
  ? BooleanType.ValueSchema
  : T extends NullType.NullType
  ? NullType.ValueSchema
  : T extends ObjectType.ObjectType
  ? ObjectType.ValueSchema
  : T extends ArrayType.ArrayType
  ? ArrayType.ValueSchema
  : never {
  switch (schema.type) {
    case "string":
      return StringType.makeSchema(schema) as never;
    case "integer":
    case "number":
      return NumberType.makeSchema(schema) as never;
    case "boolean":
      return BooleanType.makeSchema(schema) as never;
    case "null":
      return NullType.makeSchema(schema) as never;
    case "object":
      return ObjectType.makeSchema(schema) as never;
    case "array":
      return ArrayType.makeSchema(schema) as never;
  }
}

export function untypedSchema<T extends DataType>(schema: T) {
  switch (schema.type) {
    case "string":
      return StringType.makeSchema(schema);
    case "integer":
    case "number":
      return NumberType.makeSchema(schema);
    case "boolean":
      return BooleanType.makeSchema(schema);
    case "null":
      return NullType.makeSchema(schema);
    case "object":
      return ObjectType.makeSchema(schema);
    case "array":
      return ArrayType.makeSchema(schema);
  }
}
