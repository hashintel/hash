import * as S from "@effect/schema/Schema";
import * as Struct from "effect/Struct";

import * as DataTypeSchema from "./DataTypeSchema";
import * as DataTypeUrl from "./DataTypeUrl";
import * as BooleanDataType from "./internal/BooleanDataType";
import * as NullDataType from "./internal/NullDataType";
import * as NumberDataType from "./internal/NumberDataType";
import * as StringDataType from "./internal/StringDataType";
import * as ObjectDataType from "./internal/ObjectDataType";
import * as ArrayDataType from "./internal/ArrayDataType";

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

export const DataType = S.extend(
  S.struct({
    kind: S.literal("dataType"),

    id: DataTypeUrl.DataTypeUrl,
    title: S.string.pipe(S.nonEmpty()),
    description: S.optional(S.string.pipe(S.nonEmpty())),
  }),
  InnerType,
);

export type DataType = S.Schema.To<typeof DataType>;

// TODO: branding

export function makeValueSchema<T extends DataType>(
  schema: T,
): T extends StringDataType.StringDataType
  ? StringDataType.ValueSchema<T>
  : T extends NumberDataType.NumberDataType
  ? NumberDataType.ValueSchema
  : T extends BooleanDataType.BooleanDataType
  ? BooleanDataType.ValueSchema
  : T extends NullDataType.NullDataType
  ? NullDataType.ValueSchema
  : T extends ObjectDataType.ObjectDataType
  ? ObjectDataType.ValueSchema
  : T extends ArrayDataType.ArrayDataType
  ? ArrayDataType.ValueSchema
  : never {
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
