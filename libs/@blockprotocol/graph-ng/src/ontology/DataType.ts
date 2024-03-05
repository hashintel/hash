import * as S from "@effect/schema/Schema";

import * as DataTypeUrl from "./DataTypeUrl";
import * as BooleanType from "./internal/BooleanType";
import * as NullType from "./internal/NullType";
import * as NumberType from "./internal/NumberType";
import * as StringType from "./internal/StringType";

const TypeId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/DataType",
);
export type TypeId = typeof TypeId;

const InnerType = S.union(
  StringType.StringType,
  NumberType.NumberType,
  BooleanType.BooleanType,
  NullType.NullType,
);

export const DataType = S.extend(
  S.struct({
    $schema: S.literal(
      "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
    ),
    kind: S.literal("dataType"),

    $id: DataTypeUrl.DataTypeUrl,
    title: S.string.pipe(S.nonEmpty()),
    description: S.optional(S.string.pipe(S.nonEmpty())),
  }),
  InnerType,
);

export type DataType = S.Schema.To<typeof DataType>;

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
  : never {
  switch (schema.type) {
    case "string":
      return StringType.makeSchema(schema) as never;
    case "number":
      return NumberType.makeSchema(schema) as never;
    case "boolean":
      return BooleanType.makeSchema(schema) as never;
    case "null":
      return NullType.makeSchema(schema) as never;
  }

  throw new Error("unreachable");
}
