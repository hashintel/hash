import * as S from "@effect/schema/Schema";
import * as Struct from "effect/Struct";

import * as DataTypeSchema from "./DataTypeSchema";
import * as DataTypeUrl from "./DataTypeUrl";
import * as ArrayDataType from "./internal/ArrayDataType";
import * as BooleanDataType from "./internal/BooleanDataType";
import * as NullDataType from "./internal/NullDataType";
import * as NumberDataType from "./internal/NumberDataType";
import * as ObjectDataType from "./internal/ObjectDataType";
import * as StringDataType from "./internal/StringDataType";
import { DataTypeValue } from "./DataTypeValue";
import * as Json from "./internal/Json";

const TypeId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/DataType",
);
export type TypeId = typeof TypeId;

const InnerType = S.union(
  StringDataType.StringDataType,
  NumberDataType.NumberDataType,
  BooleanDataType.BooleanDataType,
  NullDataType.NullDataType,
  ObjectDataType.ObjectDataType,
  ArrayDataType.ArrayDataType,
);
type InnerType = S.Schema.To<typeof InnerType>;

export const DataType = S.extend(
  S.struct({
    // TODO: remove in favor of `TypeId`?
    kind: S.literal("dataType"),

    id: DataTypeUrl.DataTypeUrl,
    title: S.string.pipe(S.nonEmpty()),
    description: S.optional(S.string.pipe(S.nonEmpty())),
  }),
  InnerType,
);

export type DataType = S.Schema.To<typeof DataType>;

export function makeValueSchema<T extends StringDataType.StringDataType>(
  schema: T,
): StringDataType.ValueSchema<T>;
export function makeValueSchema<T extends NumberDataType.NumberDataType>(
  schema: T,
): NumberDataType.ValueSchema;
export function makeValueSchema<T extends BooleanDataType.BooleanDataType>(
  schema: T,
): BooleanDataType.ValueSchema;
export function makeValueSchema<T extends NullDataType.NullDataType>(
  schema: T,
): NullDataType.ValueSchema;
export function makeValueSchema<T extends ObjectDataType.ObjectDataType>(
  schema: T,
): ObjectDataType.ValueSchema;
export function makeValueSchema<T extends ArrayDataType.ArrayDataType>(
  schema: T,
): ArrayDataType.ValueSchema;
export function makeValueSchema(
  schema: DataType,
): S.Schema<Json.Value, DataTypeValue>;

export function makeValueSchema(schema: DataType) {
  switch (schema.type) {
    case "string":
      return StringDataType.makeSchema(schema) as never;
    case "integer":
    case "number":
      return NumberDataType.makeSchema(schema) as never;
    case "boolean":
      return BooleanDataType.makeSchema(schema) as never;
    case "null":
      return NullDataType.makeSchema(schema) as never;
    case "object":
      return ObjectDataType.makeSchema(schema) as never;
    case "array":
      return ArrayDataType.makeSchema(schema) as never;
  }
}

export function toSchema(schema: DataType): DataTypeSchema.DataTypeSchema {
  return {
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
    $id: schema.id,
    ...Struct.omit("id")(schema),
  };
}
