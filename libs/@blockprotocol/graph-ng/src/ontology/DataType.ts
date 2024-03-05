import * as S from "@effect/schema/Schema";

import * as VersionedUrl from "../VersionedUrl";

const TypeId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/DataType",
);
export type TypeId = typeof TypeId;

const NumberType = S.struct({
  type: S.literal("number", "integer"),
  multipleOf: S.optional(S.number),
  minimum: S.optional(S.number),
  maximum: S.optional(S.number),
  exclusiveMinimum: S.optional(S.boolean),
  exclusiveMaximum: S.optional(S.boolean),
});

export const DataType = S.struct({
  $schema: S.literal(
    "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
  ),
  kind: S.literal("dataType"),

  $id: VersionedUrl.VersionedUrl,
  title: S.string.pipe(S.nonEmpty()),
  description: S.optional(S.string.pipe(S.nonEmpty())),

  type: S.literal("number", "string", "boolean"),
});
