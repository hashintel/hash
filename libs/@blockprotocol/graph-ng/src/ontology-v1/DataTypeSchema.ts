import * as S from "@effect/schema/Schema";

import * as DataTypeUrl from "./DataTypeUrl";

export const DataTypeSchema = S.struct({
  $schema: S.literal(
    "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
  ),
  kind: S.literal("dataType"),
  $id: DataTypeUrl.DataTypeUrl,

  title: S.string,
  description: S.optional(S.string),

  type: S.string,
});

export type DataTypeSchema = S.Schema.Type<typeof DataTypeSchema>;
